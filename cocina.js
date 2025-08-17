import {
    auth,
    db,
    logout,
    onAuthStateChanged,
    actualizarEstadoPedido,
    getUserData
} from './database.js';

console.log("Inicializando módulo cocina.js (modo depuración)");

document.addEventListener('DOMContentLoaded', () => {
    const btnLogout = document.getElementById('btn-logout');
    const pedidosContainer = document.getElementById('pedidos-container');
    const filtroEstado = document.getElementById('filtro-estado');
    const filtroFecha = document.getElementById('filtro-fecha');
    const btnActualizar = document.getElementById('btn-actualizar');
    const mensajesContainer = document.getElementById('mensajes-container');

    let unsuscribePedidos = null;

    filtroFecha.valueAsDate = new Date();

    function showMessage(mensaje, tipo = 'info') {
        mensajesContainer.innerHTML = `
            <div class="mensaje ${tipo}">
                <i class="fas fa-${tipo === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                ${mensaje}
            </div>
        `;
    }

    onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        try {
            const userData = await getUserData(user.uid);
            console.log("Datos de usuario obtenidos:", userData);

            if (!userData || userData.rol !== 'cocina') {
                console.warn('⚠ Usuario sin rol válido. Forzando acceso como cocina.');
            }

            filtroFecha.valueAsDate = new Date();
            observarPedidosEnTiempoReal();

        } catch (error) {
            console.error("Error verificando usuario:", error);
            showMessage('❌ Error al verificar usuario: ' + error.message, 'error');
        }
    });

    function observarPedidosEnTiempoReal() {
        const estado = filtroEstado.value;
        const fecha = filtroFecha.valueAsDate || new Date();

        const inicio = new Date(fecha);
        inicio.setHours(0, 0, 0, 0);

        const fin = new Date(fecha);
        fin.setHours(23, 59, 59, 999);

        const inicioTimestamp = firebase.firestore.Timestamp.fromDate(inicio);
        const finTimestamp = firebase.firestore.Timestamp.fromDate(fin);

        let query = db.collection("pedidos")
            .where("fecha", ">=", inicioTimestamp)
            .where("fecha", "<=", finTimestamp)
            .orderBy("fecha", "desc");

        unsuscribePedidos = query.onSnapshot(snapshot => {
            const pedidos = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    fecha: data.fecha?.toDate?.() || new Date()
                };
            });

            if (pedidos.length === 0) {
                pedidosContainer.innerHTML = `
                    <div class="sin-pedidos">
                        <i class="far fa-folder-open"></i>
                        No hay pedidos para los filtros seleccionados
                    </div>
                `;
                return;
            }

            mostrarPedidos(pedidos);
        }, error => {
            console.error("Error observando pedidos:", error);
            showMessage('Error al actualizar pedidos: ' + error.message, 'error');
        });
    }

    function mostrarPedidos(pedidos) {
        pedidosContainer.innerHTML = '';
        pedidos.forEach(pedido => {
            pedidosContainer.appendChild(crearPedidoElement(pedido));
        });
    }

    function crearPedidoElement(pedido) {
        const items = pedido.items || [];
        const fecha = pedido.fecha instanceof Date ? pedido.fecha : new Date(pedido.fecha?.seconds * 1000 || Date.now());
        const fechaStr = fecha.toLocaleString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
        });

        const div = document.createElement('div');
        div.className = `pedido-cocina ${pedido.estado || 'pendiente'}`;
        div.innerHTML = `
        <div class="pedido-header">
            <div>
                <h3>Mesa ${pedido.mesa || 'N/A'}</h3>
                <p class="usuario-pedido">
                    <i class="fas fa-user-tag"></i> 
                    <span class="usuario-rol">Punto de Venta</span>
                    <span class="usuario-email">(${pedido.usuarioEmail || 'Anónimo'})</span>
                </p>
            </div>
            <span class="estado-badge ${pedido.estado || 'pendiente'}">${formatearEstado(pedido.estado || 'pendiente')}</span>
        </div>
        <!-- resto del contenido -->

        ${pedido.observacion ? `
            <div class="pedido-observacion">
                <strong><i class="fas fa-sticky-note"></i> Observación:</strong> 
                ${pedido.observacion}
            </div>
        ` : ''}
        <p class="pedido-fecha">
            <i class="far fa-clock"></i> ${fechaStr}
        </p>
        <ul class="items-pedido">
            ${items.map(item => `
                <li>
                    <span class="item-nombre">${item.nombre || 'Producto'} x${item.cantidad || 1}</span>
                    <span class="item-precio">$${((item.precio || 0) * (item.cantidad || 1)).toFixed(2)}</span>
                </li>
            `).join('')}
        </ul>
        <div class="pedido-footer">
            <p class="total-pedido">
                <strong>Total:</strong> $${(pedido.total || 0).toFixed(2)}
            </p>
            <div class="acciones-pedido">
                <button class="btn-estado ${pedido.estado || 'pendiente'}" data-id="${pedido.id}">
                    ${formatearEstado(pedido.estado || 'pendiente')}
                </button>
            </div>
        </div>
    `;

        const btnEstado = div.querySelector('.btn-estado');
        btnEstado.addEventListener('click', async () => {
            const ordenEstados = ['pendiente', 'en_preparacion', 'completado'];
            const indiceActual = ordenEstados.indexOf(pedido.estado || 'pendiente');

            if (indiceActual >= ordenEstados.length - 1) return;

            const nuevoEstado = ordenEstados[indiceActual + 1];
            try {
                await actualizarEstadoPedido(pedido.id, nuevoEstado);
                showMessage('Estado actualizado correctamente', 'info');
                observarPedidosEnTiempoReal();
            } catch (error) {
                console.error("Error actualizando estado:", error);
                showMessage('Error al actualizar estado: ' + error.message, 'error');
            }
        });

        return div;
    }

    function formatearEstado(estado) {
        const estados = {
            'pendiente': 'PENDIENTE',
            'en_preparacion': 'EN PREPARACIÓN',
            'completado': 'COMPLETADO'
        };
        return estados[estado] || estado;
    }

    filtroEstado.addEventListener('change', observarPedidosEnTiempoReal);
    filtroFecha.addEventListener('change', observarPedidosEnTiempoReal);
    btnActualizar.addEventListener('click', () => {
        filtroFecha.valueAsDate = new Date();
        observarPedidosEnTiempoReal();
    });

    btnLogout.addEventListener('click', async () => {
        try {
            await logout();
            window.location.href = "login.html";
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
            showMessage('Error al cerrar sesión', 'error');
        }
    });
});