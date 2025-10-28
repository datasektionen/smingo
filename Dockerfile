FROM docker.io/denoland/deno:alpine-2.3.7

WORKDIR /app

COPY deno.json deno.lock cards.ts cards-VM.ts ./
RUN deno install

COPY main.tsx ./

CMD ["deno", "task", "start"]
