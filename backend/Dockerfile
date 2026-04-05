FROM node:22-bookworm-slim
WORKDIR /app

# Prisma engine compatibility (libssl) and TLS certificates
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 4000
CMD ["sh", "-c", "npm run prisma:generate && npm run db:push && npm run start:dev"]
