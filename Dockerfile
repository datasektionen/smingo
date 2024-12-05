FROM docker.io/denoland/deno:alpine-2.1.2

WORKDIR /app

COPY deno.json deno.lock ./
RUN deno install

COPY main.tsx ./

CMD ["deno", "task", "start"]
