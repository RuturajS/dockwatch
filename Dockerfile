FROM python:3.11-alpine

WORKDIR /app

COPY requirements.txt .

# Install dependencies including curl for Trivy installation
RUN apk add --no-cache curl \
    && pip install --no-cache-dir -r requirements.txt \
    && curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin

# Create volume/config directory if needed
RUN mkdir -p /app/config && chmod 777 /app/config

COPY . .

EXPOSE 8080

CMD ["python", "app.py"]
