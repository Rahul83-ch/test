FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["npm","start"]


# docker build -t registry-local.flextronassembly.net/q2c/rook-ceph-backend-phase2:latest .

# docker push registry-local.flextronassembly.net/q2c/rook-ceph-backend-phase2:latest