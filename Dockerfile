FROM python:3.9-alpine

WORKDIR /app

COPY requirements.txt .

# Install dependencies (use --no-cache-dir to keep image small)
RUN pip install --no-cache-dir -r requirements.txt

# Create volume/config directory if needed
RUN mkdir -p /app/config && chmod 777 /app/config

COPY . .

EXPOSE 8080

CMD ["python", "app.py"]
