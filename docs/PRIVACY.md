# Privacidad (RGPD)

- **Minimización**: se almacenan email, nombre y hash de contraseña; no se piden datos personales innecesarios. Las propiedades y documentos son datos del cliente en su tenant.
- **Finalidad**: análisis de inversión inmobiliaria para la organización del usuario.
- **Derechos del interesado**: exportación y eliminación por organización (cascadas `onDelete: cascade` en `organizations`); endpoints de exportación/borrado en la hoja de ruta.
- **Retención**: sesiones caducan a 14 días; auditoría y runs se conservan mientras exista la organización (política configurable).
- **Datos protegidos de terceros**: el adaptador público de Catastro no solicita valores catastrales; los datos aportados por el usuario (nota simple, dossier) se guardan en su tenant y no se mezclan.
- **Registro de accesos**: `audit_events`.
- **IA**: si se configura un proveedor externo, solo se envían hechos calculados del deal (sin datos personales del usuario).
