// Configuración de Firebase (sin cambios)
const firebaseConfig = {
  apiKey: "AIzaSyAEtqFKGfLqfkBu8VbrM5_VzydedzPIynU",
  authDomain: "activa-firestore-database.firebaseapp.com",
  projectId: "activa-firestore-database",
  storageBucket: "activa-firestore-database.appspot.com",
  messagingSenderId: "804240087130",
  appId: "1:804240087130:web:75477bf4ebf648eb1fe063"
};

// Inicialización única de Firebase (sin cambios)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();

// Función auxiliar para manejo de fechas
function getStartOfDayUTC(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function getEndOfDayUTC(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

// Función para guardar pedidos (modificada para asegurar timestamp consistente)
// En la función guardarPedidoEnDB
async function guardarPedidoEnDB(pedido) {
  try {
    const user = auth.currentUser;
    const pedidoData = {
      ...pedido,
      usuarioId: user?.uid || 'anonimo', // Incluir el ID del usuario
      usuarioEmail: user?.email || 'Anónimo', // Incluir el email del usuario
      fecha: firebase.firestore.FieldValue.serverTimestamp(),
      fechaLocal: new Date().toISOString()
    };

     const docRef = await db.collection("pedidos").add(pedidoData);
        console.log("Pedido guardado con ID: ", docRef.id);
        return docRef;
    } catch (e) {
        console.error("Error al guardar pedido: ", e);
        throw e; e;
  }
}

// Función para obtener pedidos del día (modificada para usar UTC)
async function obtenerPedidosDelDia(fechaBase = new Date()) {
    // Convertir fechaBase a fecha local del dispositivo
    const dia = fechaBase.getDate();
    const mes = fechaBase.getMonth() + 1;
    const anio = fechaBase.getFullYear();
    
    const snapshot = await db.collection("pedidos")
        .where("diaLocal", "==", dia)
        .where("mesLocal", "==", mes)
        .where("anioLocal", "==", anio)
        .orderBy("fecha", "desc")
        .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
// Función para formatear fecha para visualización
function formatFirebaseDate(fecha, timeZone = 'America/Mexico_City') {
  if (!fecha) return 'N/A';
  
  try {
    const dateObj = fecha?.toDate ? fecha.toDate() : new Date(fecha);
    return dateObj.toLocaleString('es-MX', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    console.error("Error formateando fecha:", e);
    return 'Fecha inválida';
  }
}


// Función para observar cambios en los pedidos
function observarPedidos(callback) {
  return db.collection("pedidos").onSnapshot((snapshot) => {
    const pedidos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(pedidos);
  });
}

// Función para actualizar el estado de un pedido
async function actualizarEstadoPedido(id, nuevoEstado) {
  await db.collection("pedidos").doc(id).update({ estado: nuevoEstado });
}

// Función para iniciar sesión
async function login(email, password) {
  return await auth.signInWithEmailAndPassword(email, password);
}

// Función para cerrar sesión
async function logout() {
  return await auth.signOut();
}

// Función para crear un nuevo usuario
async function crearUsuario(email, password, rol) {
  const rolesValidos = ['admin', 'pos', 'cocina'];
  if (!rolesValidos.includes(rol)) {
    throw new Error('Rol no válido');
  }

  // Guardamos el admin que está logueado actualmente
  const adminUser = auth.currentUser;
  const adminEmail = adminUser.email;
  const adminPassword = prompt("⚠️ Ingresa tu contraseña de admin para continuar:");

  let userCredential;

  try {
    // Crear usuario en Auth SIN CAMBIAR la sesión del admin
    // 👉 Aquí usamos createUserWithEmailAndPassword en un "segundo auth" (app secundaria)
    const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
    const secondaryAuth = secondaryApp.auth();
    userCredential = await secondaryAuth.createUserWithEmailAndPassword(email, password);

    // Crear documento en Firestore para el nuevo usuario
    await db.collection("usuarios").doc(userCredential.user.uid).set({
      email: email,
      rol: rol,
      fechaCreacion: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Cerrar sesión en la app secundaria
    await secondaryAuth.signOut();
    secondaryApp.delete();

    return userCredential.user;

  } catch (error) {
    console.error("Error en crearUsuario:", error);

    // Limpieza si falla
    if (userCredential?.user) {
      try {
        await userCredential.user.delete();
      } catch (deleteError) {
        console.error("Error al limpiar usuario fallido:", deleteError);
      }
    }

    throw error;
  }
}


// Función para obtener todos los usuarios
async function getUsuarios() {
  try {
    const snapshot = await db.collection("usuarios").get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error al obtener usuarios:", error);
    throw error;
  }
}

// Función para obtener datos de un usuario específico
async function getUserData(uid) {
  try {
    const doc = await db.collection("usuarios").doc(uid).get();
    
    if (!doc.exists) {
      console.warn("Usuario no encontrado en Firestore");
      return null;
    }
    
    const data = doc.data();
    
    if (!data.rol || !data.email) {
      console.error("Datos de usuario incompletos en Firestore");
      return null;
    }
    
    return {
      id: doc.id,
      ...data,
      fechaCreacion: data.fechaCreacion?.toDate?.() || null
    };
    
  } catch (error) {
    console.error("Error al obtener datos de usuario:", error);
    return null;
  }
}

// Función para manejar cambios en el estado de autenticación
function onAuthStateChanged(callback) {
  return auth.onAuthStateChanged(async (user) => {
    if (user) {
      try {
        const userData = await getUserData(user.uid);
        
        if (!userData) {
          await logout();
          callback(null);
          return;
        }
        
        callback({ 
          ...user, 
          ...userData
        });
      } catch (error) {
        console.error("Error al obtener datos de usuario:", error);
        await logout();
        callback(null);
      }
    } else {
      callback(null);
    }
  });
}

// Función para eliminar un usuario
// En tu archivo database.js
async function eliminarUsuario(uid) {
  try {
    await db.collection("usuarios").doc(uid).delete();
    return { success: true, message: "Usuario eliminado de Firestore" };
  } catch (error) {
    console.error("Error al eliminar usuario:", error);
    throw error;
  }
}


// Exportación de funciones
export { 
  db, 
  auth, 
  guardarPedidoEnDB, 
  observarPedidos, 
  actualizarEstadoPedido, 
  login, 
  logout, 
  onAuthStateChanged,
  crearUsuario,
  getUsuarios,
  getUserData,
  eliminarUsuario
};