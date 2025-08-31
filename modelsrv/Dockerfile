FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir fastapi "uvicorn[standard]" numpy
COPY server.py /app/server.py
ENV MODEL_NAME=price_forecaster
EXPOSE 8501
CMD ["uvicorn","server:app","--host","0.0.0.0","--port","8501"]
