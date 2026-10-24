FROM node:20-alpine AS build
WORKDIR /workspace
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY . .
RUN npx prisma generate --schema apps/api/prisma/schema.prisma \
  && npm run build --workspace=apps/api

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=build /workspace/package*.json ./
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api ./apps/api
COPY --from=build /workspace/apps/web/package.json ./apps/web/package.json
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && npm run db:seed --workspace=apps/api && npm run start --workspace=apps/api"]
