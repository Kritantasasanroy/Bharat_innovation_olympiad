FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, not read
# at container start — Next.js only sees them if they are process env vars
# *during* `next build`. A bare `ARG` is not that: it exists only for
# `docker build`'s own substitution and is invisible to the process running
# inside the build step. Without the ENV line here, `--build-arg
# NEXT_PUBLIC_API_URL=...` is silently accepted and silently does nothing —
# next.config.js's `env` block falls back to its 'http://localhost:4000'
# default, and every deployed admin login tries to reach the browser's own
# machine. That shipped once already: dev's admin login failed with
# "Invalid admin credentials" for every real cause except the one the message
# suggests, because the frontend's catch-all error handler shows that same
# string for a network failure as for a wrong password.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./

EXPOSE 3001

ENV PORT=3001

CMD ["npm", "start"]
