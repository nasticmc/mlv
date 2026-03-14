FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data

EXPOSE 8765

ENV MESH_ARGS=""
CMD ["sh", "-c", "python server.py --ws-host 0.0.0.0 ${MESH_ARGS}"]
