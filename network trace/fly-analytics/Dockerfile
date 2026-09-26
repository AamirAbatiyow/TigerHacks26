FROM python:3.12-slim

WORKDIR /app

COPY server.py .
COPY privacy ./privacy

ENV PYTHONUNBUFFERED=1

EXPOSE 8080

CMD ["python", "server.py"]