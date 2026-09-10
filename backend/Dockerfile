FROM node:20-alpine AS builder

WORKDIR /app

# Prisma's engine is chosen by detecting the libssl version at `prisma generate`
# time. Without the openssl package the detector gives up, silently picks the
# openssl-1.1.x engine, and that engine then fails to load against Alpine's
# openssl 3 at runtime ("Could not parse schema engine response"). Install it in
# BOTH stages so generate and `migrate deploy` agree.
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl

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
