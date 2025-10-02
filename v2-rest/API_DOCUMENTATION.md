# API Deluxe Backend v2.0 - Documentación de Endpoints

## 📋 Información General

- **Versión**: 2.0
- **Base URL**: `/api/v2`
- **Formato de respuesta**: JSON
- **Autenticación**: No implementada en v2 (opcional para implementar)

---

## 🚀 Módulos Disponibles

### 1. **Usuarios Otros Sorteos** (`/api/v2/usuarios-otros`)
### 2. **Registradores** (`/api/v2/registradores`)
### 3. **Tipos de Registradores** (`/api/v2/tipos-registradores`)

---

## 📚 1. USUARIOS OTROS SORTEOS

### 🔹 **POST** `/api/v2/usuarios-otros/register`
**Descripción**: Registrar un nuevo usuario en otros sorteos

**Body (JSON)**:
```json
{
  "first_name": "Juan",
  "last_name": "Pérez",
  "id_card": "1234567890",
  "phone": "0987654321",
  "provincia_id": 1,
  "canton_id": 1,
  "barrio_id": 1,
  "latitud": -0.1807,
  "longitud": -78.4678,
  "ubicacion_detallada": "Sector Norte, Calle Principal",
  "id_registrador": 1,
  "id_evento": 1
}
```

**Campos obligatorios**: `first_name`, `last_name`, `id_card`

**Respuesta exitosa** (201):
```json
{
  "success": true,
  "message": "Usuario registrado exitosamente en otros sorteos",
  "data": {
    "id": 123,
    "first_name": "Juan",
    "last_name": "Pérez",
    "id_card": "1234567890",
    "fecha_registro": "2025-10-02T10:30:00.000Z"
  }
}
```

### 🔹 **GET** `/api/v2/usuarios-otros/user/:id_card`
**Descripción**: Buscar usuario por número de cédula

**Parámetros**:
- `id_card`: Número de cédula (10 dígitos)

**Respuesta exitosa** (200):
```json
{
  "success": true,
  "data": {
    "id": 123,
    "first_name": "Juan",
    "last_name": "Pérez",
    "id_card": "1234567890",
    "phone": "0987654321",
    "provincia_nombre": "Pichincha",
    "canton_nombre": "Quito",
    "barrio_nombre": "La Floresta",
    "nombre_registrador": "Ana García",
    "fecha_registro": "2025-10-02T10:30:00.000Z"
  }
}
```

### 🔹 **GET** `/api/v2/usuarios-otros/users`
**Descripción**: Obtener todos los usuarios con paginación

**Query Parameters**:
- `page`: Número de página (default: 1)
- `limit`: Registros por página (default: 10, max: 100)

**Ejemplo**: `/api/v2/usuarios-otros/users?page=1&limit=20`

**Respuesta exitosa** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "first_name": "Juan",
      "last_name": "Pérez",
      "id_card": "1234567890",
      "provincia_nombre": "Pichincha",
      "canton_nombre": "Quito",
      "barrio_nombre": "La Floresta",
      "nombre_registrador": "Ana García",
      "fecha_registro": "2025-10-02T10:30:00.000Z"
    }
  ],
  "pagination": {
    "current_page": 1,
    "total_pages": 5,
    "total_records": 48,
    "records_per_page": 10
  }
}
```

### 🔹 **GET** `/api/v2/usuarios-otros/check/:id_card`
**Descripción**: Verificar si un usuario existe por cédula con brigada activa

**Parámetros**:
- `id_card`: Número de cédula (10 dígitos)

**Ejemplo**: `/api/v2/usuarios-otros/check/1234567890`

**Respuesta exitosa** (200):
```json
{
  "success": true,
  "message": "Usuario encontrado",
  "data": {
    "id": 123,
    "first_name": "Juan",
    "last_name": "Pérez",
    "id_card": "1234567890",
    "phone": "0987654321",
    "provincia_nombre": "Pichincha",
    "canton_nombre": "Quito",
    "barrio_nombre": "La Floresta",
    "nombre_registrador": "Ana García",
    "fecha_registro": "2025-10-02T10:30:00.000Z"
  },
  "exists": true,
  "brigadaInfo": {
    "id_evento": 1,
    "nombre_brigada": "Brigada Principal",
    "activa": true
  }
}
```

**Respuesta cuando no existe** (200):
```json
{
  "success": true,
  "message": "Usuario no encontrado",
  "data": null,
  "exists": false,
  "brigadaInfo": {
    "id_evento": 1,
    "nombre_brigada": "Brigada Principal",
    "activa": true
  }
}
```

**Respuesta sin brigada activa** (400):
```json
{
  "success": false,
  "message": "No hay brigadas activas disponibles",
  "data": null,
  "exists": false,
  "brigadaInfo": null
}
```

---

## 👤 2. REGISTRADORES

### 🔹 **POST** `/api/v2/registradores`
**Descripción**: Crear un nuevo registrador

**Body (JSON)**:
```json
{
  "nombre_registrador": "Ana García Rodríguez",
  "id_tipo_registrador": 1
}
```

**Campos obligatorios**: `nombre_registrador`
**Campos opcionales**: `id_tipo_registrador`

**Respuesta exitosa** (201):
```json
{
  "success": true,
  "message": "Registrador creado exitosamente",
  "data": {
    "id": 15,
    "nombre_registrador": "Ana García Rodríguez",
    "id_tipo_registrador": 1
  }
}
```

### 🔹 **GET** `/api/v2/registradores`
**Descripción**: Obtener todos los registradores con paginación

**Query Parameters**:
- `page`: Número de página (default: 1)
- `limit`: Registros por página (default: 20, max: 100)

**Ejemplo**: `/api/v2/registradores?page=1&limit=10`

**Respuesta exitosa** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": 15,
      "nombre_registrador": "Ana García Rodríguez",
      "id_tipo_registrador": 1,
      "tipo_nombre": "Coordinador General",
      "tipo_descripcion": "Registrador encargado de coordinar múltiples brigadas"
    },
    {
      "id": 16,
      "nombre_registrador": "Carlos Mendoza",
      "id_tipo_registrador": null,
      "tipo_nombre": null,
      "tipo_descripcion": null
    }
  ],
  "pagination": {
    "current_page": 1,
    "total_pages": 3,
    "total_records": 25,
    "records_per_page": 10
  }
}
```

### 🔹 **GET** `/api/v2/registradores/:id`
**Descripción**: Obtener registrador por ID

**Parámetros**:
- `id`: ID del registrador

**Respuesta exitosa** (200):
```json
{
  "success": true,
  "data": {
    "id": 15,
    "nombre_registrador": "Ana García Rodríguez",
    "id_tipo_registrador": 1,
    "tipo_nombre": "Coordinador General",
    "tipo_descripcion": "Registrador encargado de coordinar múltiples brigadas",
    "tipo_activo": 1
  }
}
```

### 🔹 **GET** `/api/v2/registradores/tipo/:id_tipo`
**Descripción**: Obtener registradores por tipo específico

**Parámetros**:
- `id_tipo`: ID del tipo de registrador

**Respuesta exitosa** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": 15,
      "nombre_registrador": "Ana García Rodríguez",
      "id_tipo_registrador": 1,
      "tipo_nombre": "Coordinador General",
      "tipo_descripcion": "Registrador encargado de coordinar múltiples brigadas"
    }
  ],
  "total": 1
}
```

### 🔹 **GET** `/api/v2/registradores/stats`
**Descripción**: Obtener estadísticas de registradores

**Respuesta exitosa** (200):
```json
{
  "success": true,
  "data": {
    "total_registradores": 25,
    "registradores_con_tipo": 18,
    "registradores_sin_tipo": 7,
    "tipos_registradores_activos": 5,
    "porcentaje_con_tipo": 72
  }
}
```

### 🔹 **PUT** `/api/v2/registradores/:id`
**Descripción**: Actualizar registrador existente

**Parámetros**:
- `id`: ID del registrador

**Body (JSON)**:
```json
{
  "nombre_registrador": "Ana García Rodríguez (Actualizado)",
  "id_tipo_registrador": 2
}
```

**Respuesta exitosa** (200):
```json
{
  "success": true,
  "message": "Registrador actualizado exitosamente"
}
```

---

## 🏷️ 3. TIPOS DE REGISTRADORES

### 🔹 **POST** `/api/v2/tipos-registradores`
**Descripción**: Crear un nuevo tipo de registrador

**Body (JSON)**:
```json
{
  "nombre_tipo": "Coordinador de Zona",
  "descripcion": "Registrador encargado de coordinar una zona específica"
}
```

**Campos obligatorios**: `nombre_tipo`
**Campos opcionales**: `descripcion`

**Respuesta exitosa** (201):
```json
{
  "success": true,
  "message": "Tipo de registrador creado exitosamente",
  "data": {
    "id": 6,
    "nombre_tipo": "Coordinador de Zona",
    "descripcion": "Registrador encargado de coordinar una zona específica"
  }
}
```

### 🔹 **GET** `/api/v2/tipos-registradores`
**Descripción**: Obtener todos los tipos de registradores

**Query Parameters**:
- `include_inactive`: `true` para incluir tipos inactivos (default: false)

**Ejemplo**: `/api/v2/tipos-registradores?include_inactive=true`

**Respuesta exitosa** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "nombre_tipo": "Coordinador General",
      "descripcion": "Registrador encargado de coordinar múltiples brigadas",
      "activo": 1,
      "created_at": "2025-10-02T10:00:00.000Z",
      "updated_at": "2025-10-02T10:00:00.000Z"
    },
    {
      "id": 2,
      "nombre_tipo": "Coordinador de Brigada",
      "descripcion": "Registrador encargado de una brigada específica",
      "activo": 1,
      "created_at": "2025-10-02T10:00:00.000Z",
      "updated_at": "2025-10-02T10:00:00.000Z"
    }
  ],
  "total": 2
}
```

### 🔹 **GET** `/api/v2/tipos-registradores/:id`
**Descripción**: Obtener tipo de registrador por ID

**Parámetros**:
- `id`: ID del tipo de registrador

**Respuesta exitosa** (200):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "nombre_tipo": "Coordinador General",
    "descripcion": "Registrador encargado de coordinar múltiples brigadas",
    "activo": 1,
    "created_at": "2025-10-02T10:00:00.000Z",
    "updated_at": "2025-10-02T10:00:00.000Z"
  }
}
```

### 🔹 **PUT** `/api/v2/tipos-registradores/:id`
**Descripción**: Actualizar tipo de registrador existente

**Parámetros**:
- `id`: ID del tipo de registrador

**Body (JSON)**:
```json
{
  "nombre_tipo": "Coordinador General Actualizado",
  "descripcion": "Nueva descripción del tipo",
  "activo": true
}
```

**Campos opcionales**: `activo` (true/false o 1/0)

**Respuesta exitosa** (200):
```json
{
  "success": true,
  "message": "Tipo de registrador actualizado exitosamente"
}
```

### 🔹 **DELETE** `/api/v2/tipos-registradores/:id`
**Descripción**: Desactivar tipo de registrador (soft delete)

**Parámetros**:
- `id`: ID del tipo de registrador

**Respuesta exitosa** (200):
```json
{
  "success": true,
  "message": "Tipo de registrador desactivado exitosamente"
}
```

---

## 📊 Información General de la API

### 🔹 **GET** `/api/v2/`
**Descripción**: Información general de la API y módulos disponibles

**Respuesta exitosa** (200):
```json
{
  "success": true,
  "message": "API Deluxe Backend v2.0",
  "version": "2.0",
  "timestamp": "2025-10-02T15:30:00.000Z",
  "availableModules": [
    {
      "name": "usuarios-otros-sorteos",
      "basePath": "/api/v2/usuarios-otros",
      "description": "Gestión de usuarios y otros tipos de sorteos"
    },
    {
      "name": "registradores",
      "basePath": "/api/v2/registradores",
      "description": "Gestión de registradores y sus funcionalidades"
    },
    {
      "name": "tipos-registradores",
      "basePath": "/api/v2/tipos-registradores",
      "description": "Gestión de tipos de registradores y categorías"
    }
  ],
  "documentation": "Endpoints disponibles para la nueva versión de la API"
}
```

---

## ⚠️ Códigos de Error Comunes

### **400 - Bad Request**
- Parámetros faltantes o inválidos
- Formato de datos incorrecto
- Validaciones fallidas

### **404 - Not Found**
- Recurso no encontrado
- ID inexistente

### **409 - Conflict**
- Cédula duplicada
- Nombre de tipo de registrador duplicado

### **500 - Internal Server Error**
- Error interno del servidor
- Error de base de datos

---

## 📝 Notas Importantes

1. **Validaciones de Cédula**: Debe tener exactamente 10 dígitos
2. **Paginación**: Por defecto page=1, limit varía por endpoint
3. **Campos Opcionales**: Los tipos de registradores son opcionales para registradores
4. **Soft Delete**: Los tipos de registradores se desactivan, no se eliminan
5. **Relaciones**: Los registradores pueden o no tener un tipo asignado
6. **Timestamps**: Se manejan automáticamente en tipos de registradores

---

## 🔄 Flujo de Trabajo Recomendado

1. **Configurar tipos de registradores** (opcional pero recomendado)
2. **Crear registradores** (con o sin tipo)
3. **Registrar usuarios** asociándolos a registradores específicos
4. **Consultar estadísticas** para monitoreo y control

---

## 🚀 Próximas Implementaciones

- [ ] Autenticación y autorización
- [ ] Filtros avanzados de búsqueda
- [ ] Exportación de datos
- [ ] Logs de auditoría
- [ ] Validaciones más robustas
- [ ] Rate limiting

---

*Documentación generada automáticamente para API Deluxe Backend v2.0*
*Fecha: 2 de octubre de 2025*