<img src="assets/hero.svg" alt="Aadityasinh Zala — DevOps, Cloud Infrastructure and SRE" width="100%" />

## 🧑‍💻 About Me

```hcl
resource "human" "aadityasinh_zala" {
  role  = "DevOps Engineer"
  focus = ["cloud infrastructure", "CI/CD", "automation"]

  stack = {
    cloud         = ["AWS"]
    iac           = ["Terraform", "Ansible"]
    containers    = ["Docker", "Kubernetes"]
    pipelines     = ["Jenkins", "GitLab CI"]
    observability = ["Prometheus", "Grafana", "Loki", "OpenTelemetry"]
    languages     = ["Python", "Bash", "JavaScript"]
  }

  currently_building = "multi-region cross-failover infrastructure"
  interests          = ["scalable systems", "modular architecture"]

  lifecycle {
    prevent_destroy = true
  }
}
```

---

## 🛠️ Tech Stack

<img src="assets/card-stack.svg" alt="Tech stack: AWS, Terraform, Kubernetes, Docker, Jenkins, GitLab, Ansible, Linux, Prometheus, Grafana, NGINX, Git, Python, Node.js, Bash" width="100%" />

---

## 🚀 Projects

### 🔹 Sportsphere

* MERN stack application for sports tournament & team management, containerized with Docker.
* CI/CD pipeline powered by Jenkins, deploying to Kubernetes on AWS cloud.
* Features automated scheduling, team registration, match handling, and scalable infra design.

<details>
<summary>⚙️ <strong>DevOps Highlights</strong> (click to expand)</summary>
<br>

```mermaid
flowchart LR
  DEV["git push"] --> CI["Jenkins<br/>build · test"]
  CI --> IMG["Docker<br/>multi-stage image"]
  IMG --> REG[("Registry")]
  REG --> K8S["AWS EKS<br/>rolling update"]
  TF["Terraform<br/>VPC · subnets · EKS"] -. provisions .-> K8S
  ANS["Ansible<br/>bootstrap + config"] -. configures .-> K8S
  K8S --> OBS["Prometheus · Loki<br/>Grafana · OpenTelemetry"]
```

| Layer | Tool / Tech | Details |
|-------|------------|----------|
| 🐳 **Containerization** | Docker, Docker Compose | Multi-stage Dockerfiles for frontend & backend with docker compose, optimized image sizes & enhanced security |
| 🔄 **CI/CD** | Jenkins | Automated build → test → push → deploy pipeline via Jenkinsfile |
| ☸️ **Orchestration** | Kubernetes | Deployment manifests, services & ingress for rolling updates on AWS EKS |
| 🏗️ **IaC** | Terraform | Infrastructure provisioned as code — VPC, subnets, EKS cluster |
| 📦 **Config Mgmt** | Ansible | Playbooks for server bootstrapping & environment configuration |
| ☁️ **Cloud** | AWS | S3 + CloudFront (frontend), EKS (backend) |
| 📊 **Monitoring** | Prometheus, Loki, Grafana, OpenTelemetry | Logs, traces, metrics & alarms for infra and application health |

</details>

---

### 🔹 Multi-Region cross-failover Infrastructure

* Designed multi-region infra using Terraform wrappers
* Implemented CI/CD with job separation strategy
* Focus on scalability & modular architecture

---

### 🔹 Car Catalogue

* Static web project
* Built using HTML/CSS
* Clean UI for showcasing car data

---

## 📊 GitHub Stats

<p align="center">
  <img src="assets/card-stats.svg" alt="GitHub metrics: contributions, commits, stars earned, pull requests, repositories and followers" width="49%" />
  <img src="assets/card-languages.svg" alt="Most used languages by share of bytes written" width="49%" />
</p>

<img src="assets/card-activity.svg" alt="Contribution activity heatmap for the last year, with current and longest streak" width="100%" />

<sub>These cards are rendered by [a GitHub Action](.github/workflows/profile-cards.yml) on a daily schedule and committed to [`assets/`](assets/) — so they load from this repo rather than a third-party image service that can cold-start and time out behind GitHub's image proxy.</sub>

---

## 🌐 Connect With Me

* 💼 LinkedIn: [aadityasinh-zala](https://linkedin.com/in/aadityasinh-zala)

---

<p align="center">
  ⭐ From <a href="https://github.com/aaditya-2905">aaditya-2905</a>
</p>
