FROM node:20

WORKDIR /app

RUN npm config set fetch-timeout 120000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5

COPY package*.json ./

RUN --mount=type=secret,id=botty_resolv_conf,target=/etc/resolv.conf,required=false \
    --mount=type=cache,target=/root/.npm \
    npm install

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5000

EXPOSE 5000

CMD ["npm", "run", "start"]
