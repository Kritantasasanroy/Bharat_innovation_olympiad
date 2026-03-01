FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for ONNX + Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    libjpeg-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create models directory
RUN mkdir -p models

EXPOSE 5000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]
