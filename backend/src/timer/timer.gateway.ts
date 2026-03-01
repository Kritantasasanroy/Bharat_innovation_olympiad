import { JwtService } from '@nestjs/jwt';
import {
    ConnectedSocket,
    MessageBody,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TimerService } from './timer.service';

@WebSocketGateway({
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true,
    },
})
export class TimerGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    constructor(
        private timerService: TimerService,
        private jwtService: JwtService,
    ) { }

    async handleConnection(client: Socket) {
        try {
            const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];
            if (!token) {
                client.disconnect();
                return;
            }

            const payload = this.jwtService.verify(token, {
                secret: process.env.JWT_SECRET || 'dev-jwt-secret',
            });

            client.data.userId = payload.sub;
            client.data.email = payload.email;
            console.log(`[WS] Connected: ${payload.email} (${client.id})`);
        } catch (err) {
            console.error('[WS] Auth failed:', err);
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        console.log(`[WS] Disconnected: ${client.data?.email || client.id}`);
        // Timer continues running server-side even if client disconnects
        // This ensures auto-submit still works
    }

    @SubscribeMessage('join-exam')
    async handleJoinExam(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { attemptId: string },
    ) {
        console.log(`[WS] ${client.data.email} joining exam: ${data.attemptId}`);

        // Join the attempt room
        client.join(`attempt:${data.attemptId}`);

        // Start server-authoritative timer
        await this.timerService.startTimer(client, data.attemptId);
    }

    @SubscribeMessage('heartbeat')
    handleHeartbeat(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { attemptId: string },
    ) {
        // Record heartbeat — used for disconnect detection
        client.data.lastHeartbeat = Date.now();
    }

    @SubscribeMessage('leave-exam')
    handleLeaveExam(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { attemptId: string },
    ) {
        client.leave(`attempt:${data.attemptId}`);
        this.timerService.stopTimer(data.attemptId);
    }
}
