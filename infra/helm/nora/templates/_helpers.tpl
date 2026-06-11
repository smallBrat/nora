{{/* Image tag: explicit value or v<appVersion>. */}}
{{- define "nora.imageTag" -}}
{{- default (printf "v%s" .Chart.AppVersion) .Values.global.imageTag -}}
{{- end -}}

{{/* Fully-qualified Nora image for a component, e.g. (include "nora.image" (dict "root" . "name" "nora-backend-api")). */}}
{{- define "nora.image" -}}
{{- printf "%s/%s:%s" .root.Values.global.imageRegistry .name (include "nora.imageTag" .root) -}}
{{- end -}}

{{/* Common labels for a component; expects (dict "root" . "component" "backend-api"). */}}
{{- define "nora.labels" -}}
app.kubernetes.io/name: nora
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
app.kubernetes.io/version: {{ .root.Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .root.Chart.Name .root.Chart.Version }}
{{- end -}}

{{/* Selector labels (stable subset). */}}
{{- define "nora.selectorLabels" -}}
app.kubernetes.io/name: nora
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{/* Name of the Secret holding core credentials. */}}
{{- define "nora.secretName" -}}
{{- default "nora-secrets" .Values.secrets.existingSecret -}}
{{- end -}}

{{/* Effective database connection facts. */}}
{{- define "nora.dbHost" -}}
{{- if .Values.postgresql.enabled -}}postgres{{- else -}}{{ required "postgresql.external.host is required when postgresql.enabled=false" .Values.postgresql.external.host }}{{- end -}}
{{- end -}}
{{- define "nora.dbPort" -}}
{{- if .Values.postgresql.enabled -}}5432{{- else -}}{{ .Values.postgresql.external.port }}{{- end -}}
{{- end -}}
{{- define "nora.dbUser" -}}
{{- if .Values.postgresql.enabled -}}{{ .Values.postgresql.auth.username }}{{- else -}}{{ .Values.postgresql.external.username }}{{- end -}}
{{- end -}}
{{- define "nora.dbName" -}}
{{- if .Values.postgresql.enabled -}}{{ .Values.postgresql.auth.database }}{{- else -}}{{ .Values.postgresql.external.database }}{{- end -}}
{{- end -}}

{{/* Effective Redis connection facts. */}}
{{- define "nora.redisHost" -}}
{{- if .Values.redis.enabled -}}redis{{- else -}}{{ required "redis.external.host is required when redis.enabled=false" .Values.redis.external.host }}{{- end -}}
{{- end -}}
{{- define "nora.redisPort" -}}
{{- if .Values.redis.enabled -}}6379{{- else -}}{{ .Values.redis.external.port }}{{- end -}}
{{- end -}}

{{/* envFrom block shared by control-plane pods (backend-api, workers). */}}
{{- define "nora.controlPlaneEnvFrom" -}}
envFrom:
  - configMapRef:
      name: nora-env
  - secretRef:
      name: {{ include "nora.secretName" . }}
{{- end -}}

{{/* Extra env entries from commonEnv/backendEnv maps; expects (dict "root" . "extra" <map>). */}}
{{- define "nora.extraEnv" -}}
{{- range $key, $value := .extra }}
- name: {{ $key }}
  value: {{ $value | quote }}
{{- end }}
{{- end -}}

{{/* imagePullSecrets block. */}}
{{- define "nora.imagePullSecrets" -}}
{{- with .Values.global.imagePullSecrets }}
imagePullSecrets:
{{- range . }}
  - name: {{ . }}
{{- end }}
{{- end }}
{{- end -}}
