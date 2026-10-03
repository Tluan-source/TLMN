import { ForbiddenException } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { IncomingMessage } from 'node:http';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../../shared/prisma.service';
import { createToken, hashToken } from '../../shared/security';

type RealtimeTicket = { userId: string; coupleId: string; expiresAt: number };

function allowedOrigins() {
  return (process.env.APP_ORIGIN || 'http://localhost:3000').split(',').map((origin) => origin.trim());
}

function originAllowed(origin?: string) {
  return !origin || allowedOrigins().includes(origin);
}

@WebSocketGateway({
  cors: { origin: (origin, callback) => callback(null, originAllowed(origin)), credentials: true },
  allowRequest: (request: IncomingMessage, callback: (error: string | null, success: boolean) => void) => {
    callback(null, originAllowed(request.headers.origin));
  },
})
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  private server!: Server;

  private readonly tickets = new Map<string, RealtimeTicket>();

  constructor(private readonly prisma: PrismaService) {}

  async issueTicket(userId: string) {
    const member = await this.prisma.coupleMember.findUnique({ where: { userId }, select: { coupleId: true } });
    if (!member) throw new ForbiddenException('Hãy tạo hoặc tham gia một workspace trước.');

    const ticket = createToken(24);
    const ticketHash = hashToken(ticket);
    const expiresAt = Date.now() + 30_000;
    this.tickets.set(ticketHash, { userId, coupleId: member.coupleId, expiresAt });
    const cleanup = setTimeout(() => this.tickets.delete(ticketHash), 30_000);
    cleanup.unref?.();
    return { ticket, expiresInSeconds: 30 };
  }

  async handleConnection(client: Socket) {
    const ticket = client.handshake.auth?.ticket;
    if (typeof ticket !== 'string' || !ticket) {
      client.disconnect(true);
      return;
    }

    const ticketHash = hashToken(ticket);
    const identity = this.tickets.get(ticketHash);
    this.tickets.delete(ticketHash);
    if (!identity || identity.expiresAt <= Date.now()) {
      client.disconnect(true);
      return;
    }

    client.data.userId = identity.userId;
    client.data.coupleId = identity.coupleId;
    await client.join(this.room(identity.coupleId));
  }

  emitStoryChanged(coupleId: string, actorId: string, date: string) {
    this.server?.to(this.room(coupleId)).emit('chat:changed', { actorId, date: date.slice(0, 10) });
  }

  emitReminderDue(coupleId: string, reminder: unknown) {
    this.server?.to(this.room(coupleId)).emit('reminder:due', reminder);
  }

  emitRemindersChanged(coupleId: string) {
    this.server?.to(this.room(coupleId)).emit('reminders:changed');
  }

  emitWorkspaceChanged(coupleId: string) {
    this.server?.to(this.room(coupleId)).emit('workspace:changed');
  }

  private room(coupleId: string) {
    return `couple:${coupleId}`;
  }
}
