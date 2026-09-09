FROM node:20-alpine

WORKDIR /app

# Bog'liqliklarni o'rnatish
COPY package*.json ./
RUN npm ci --omit=dev

# Barcha loyiha fayllarini ko'chirish
COPY . .

# Ma'lumotlar papkasi
RUN mkdir -p data

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
