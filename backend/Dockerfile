FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./
COPY entrypoint.sh ./entrypoint.sh
# Strip CRLF: the build context is often packed on Windows, and a `\r` in the
# shebang makes the kernel exec `/bin/sh\r` -> "entrypoint.sh: not found" (127).
RUN sed -i 's/\r$//' entrypoint.sh && chmod +x entrypoint.sh

EXPOSE 4000

CMD ["./entrypoint.sh"]
