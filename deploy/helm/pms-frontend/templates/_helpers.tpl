{{- define "pms-frontend.fullname" -}}
{{- default .Chart.Name .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- define "pms-frontend.labels" -}}
app.kubernetes.io/name: pms-frontend
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/part-of: pms
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
