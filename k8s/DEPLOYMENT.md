# Kubernetes Deployment Guide

## Prerequisites

- Kubernetes cluster (1.20+)
- kubectl configured
- Docker registry (Docker Hub, ECR, GCR, etc.)
- Helm (optional, for advanced setups)

## Deployment Steps

### 1. Build and Push Docker Image

```bash
# Build image
docker build -t yourusername/botty:latest .

# Login to Docker registry
docker login

# Push image
docker push yourusername/botty:latest
```

### 2. Update Configuration Files

Edit the manifests to set your values:

**k8s/namespace-and-ingress.yaml:**
```yaml
host: yourdomain.com  # Change to your domain
```

**k8s/app.yaml:**
```yaml
image: yourusername/botty:latest  # Update image reference
GOOGLE_CLIENT_ID: "YOUR_ID"       # Set your OAuth ID
GOOGLE_CLIENT_SECRET: "YOUR_SECRET" # Set your OAuth secret
JWT_SECRET: "generate-random-key"   # Generate strong key
DATABASE_URL: "postgresql://..."    # If using external DB
```

### 3. Create Kubernetes Resources

```bash
# Create namespace and ingress
kubectl apply -f k8s/namespace-and-ingress.yaml

# Create PostgreSQL database
kubectl apply -f k8s/postgres.yaml

# Wait for PostgreSQL to be ready
kubectl wait --for=condition=ready pod \
  -l app=postgres -n botty --timeout=300s

# Create application deployment
kubectl apply -f k8s/app.yaml

# Verify deployment
kubectl get pods -n botty
kubectl get svc -n botty
```

### 4. Verify Deployment

```bash
# Check pod status
kubectl get pods -n botty
kubectl describe pod -n botty <pod-name>

# View logs
kubectl logs -n botty deployment/botty-app

# Check services
kubectl get svc -n botty

# Port forward to test locally
kubectl port-forward -n botty svc/botty-app 5000:80
# Then visit http://localhost:5000
```

## Database Initialization

```bash
# Connect to PostgreSQL pod
kubectl exec -it -n botty postgres-0 -- psql -U botty_user -d botty_db

# Or run migrations from app pod
kubectl exec -n botty deployment/botty-app -- npm run db:push
```

## Common Operations

### Scale Deployment

```bash
# Scale manually
kubectl scale deployment -n botty botty-app --replicas=3

# HPA will auto-scale based on CPU/memory usage
kubectl get hpa -n botty
```

### Update Application

```bash
# Update image
kubectl set image deployment/botty-app \
  -n botty botty-app=yourusername/botty:v2

# Rollout status
kubectl rollout status deployment/botty-app -n botty

# Rollback if needed
kubectl rollout undo deployment/botty-app -n botty
```

### Access Database

```bash
# PostgreSQL service connection string:
# postgresql://botty_user:botty_pass@postgres:5432/botty_db

# Port forward to connect from local
kubectl port-forward -n botty svc/postgres 5432:5432

# Now connect from localhost:5432
```

### View Logs

```bash
# Recent logs
kubectl logs -n botty deployment/botty-app

# Tail logs
kubectl logs -f -n botty deployment/botty-app

# Logs from specific pod
kubectl logs -n botty botty-app-xxxxx

# View PostgreSQL logs
kubectl logs -n botty postgres-0
```

### Debugging

```bash
# Describe pod (shows events)
kubectl describe pod -n botty botty-app-xxxxx

# Debug shell access
kubectl exec -it -n botty botty-app-xxxxx -- /bin/sh

# Check resource usage
kubectl top pods -n botty
kubectl top nodes
```

## Production Recommendations

### 1. Use External Database
```bash
# Instead of PostgreSQL in cluster, use managed database:
# - AWS RDS
# - Google Cloud SQL
# - Azure Database for PostgreSQL

# Update DATABASE_URL in k8s/app.yaml
```

### 2. Set Resource Limits

Already configured in `app.yaml`:
```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

### 3. Enable HTTPS/TLS

Using cert-manager (example):
```bash
# Install cert-manager
helm repo add jetstack https://charts.jetstack.io
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace

# Create ClusterIssuer
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@yourdomain.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

### 4. Configure Monitoring

```bash
# Example: Deploy Prometheus
# Example: Enable pod logs aggregation
# Example: Set up alerts
```

### 5. Backup Strategy

```bash
# PostgreSQL backup using cronjob
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-backup
  namespace: botty
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:16-alpine
            command:
            - /bin/sh
            - -c
            - pg_dump -U botty_user -h postgres botty_db | gzip > /backup/db-$(date +%Y%m%d-%H%M%S).sql.gz
            volumeMounts:
            - name: backup-storage
              mountPath: /backup
          volumes:
          - name: backup-storage
            persistentVolumeClaim:
              claimName: backup-pvc
          restartPolicy: OnFailure
```

### 6. Security Best Practices

```yaml
# Run as non-root
securityContext:
  runAsNonRoot: true
  runAsUser: 1000

# Add network policy
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: botty-network-policy
  namespace: botty
spec:
  podSelector:
    matchLabels:
      app: botty-app
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: ingress
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres
```

## Troubleshooting

### Pods not starting
```bash
kubectl describe pod -n botty botty-app-xxxxx
kubectl logs -n botty botty-app-xxxxx
```

### Database connection errors
```bash
# Check if PostgreSQL is ready
kubectl get pods -n botty
kubectl logs -n botty postgres-0

# Verify connection string in secrets
kubectl get secret -n botty app-secret -o jsonpath='{.data.DATABASE_URL}' | base64 -d
```

### High memory usage
```bash
# Check resource usage
kubectl top pods -n botty

# Adjust limits in app.yaml
```

### Storage issues
```bash
# Check PVCs
kubectl get pvc -n botty

# Check storage class
kubectl get storageclass

# Debug PVC
kubectl describe pvc -n botty postgres-pvc
```

## Cleanup

```bash
# Delete all resources
kubectl delete namespace botty

# Or delete gradually:
kubectl delete deployment -n botty botty-app
kubectl delete statefulset -n botty postgres
kubectl delete service -n botty botty-app
kubectl delete namespace botty
```

## Next Steps

1. **Monitoring**: Set up Prometheus/Grafana
2. **Logging**: Configure centralized logging (ELK, Loki)
3. **CI/CD**: Set up automatic deployments (GitHub Actions, GitLab CI)
4. **Backup**: Configure automated database backups
5. **RBAC**: Implement role-based access control
6. **Storage**: Use persistent volumes for data
