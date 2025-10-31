FROM docker.io/denoland/deno:alpine-2.3.7

WORKDIR /app

COPY deno.json deno.lock ./

COPY main.tsx cards.ts cards-SM.ts cards-VM.ts ./
COPY components ./components
COPY public ./public
COPY server ./server
COPY shared ./shared
COPY media ./media

RUN deno cache main.tsx

CMD ["deno", "task", "start"]
