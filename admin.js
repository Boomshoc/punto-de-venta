import {
    auth,
    db,
    logout,
    onAuthStateChanged,
    crearUsuario,
    getUsuarios,
    observarPedidos,
    eliminarUsuario
} from "./database.js";

let pedidosActuales = []; // 🔹 Variable global para los pedidos actuales

document.addEventListener("DOMContentLoaded", () => {
    const panelAdmin = document.getElementById("panel-admin");
    const btnLogout = document.getElementById("btn-logout");
    const formCrearUsuario = document.getElementById("form-crear-usuario");
    const usuariosLista = document.getElementById("usuarios-lista");
    const pedidosCocina = document.getElementById("pedidos-cocina");
    const filtroFecha = document.getElementById("filtro-fecha");
    const btnRecargar = document.getElementById("btn-recargar");
    const btnImprimirPDF = document.getElementById("btn-imprimir");
    const btnImprimirTicket = document.getElementById("btn-imprimir-ticket");

    // Verificar autenticación y rol
    onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = "index.html";
            return;
        }

        if (typeof user.rol !== 'string' || user.rol.toLowerCase() !== 'admin') {
            alert("Acceso denegado. Este panel es solo para administradores.");
            await logout();
            window.location.href = "index.html";
            return;
        }

        panelAdmin.style.display = "block";
        btnLogout.style.display = "block";
        
        cargarUsuarios();
        observarPedidos(dibujarPedidos);
    });

    // Cierre de sesión
    btnLogout.addEventListener("click", async () => {
        await logout();
        window.location.href = "index.html";
    });

    // Crear nuevo usuario
    formCrearUsuario.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;
        const rol = document.getElementById("rol").value;

        try {
            await crearUsuario(email, password, rol);
            alert("Usuario creado correctamente.");
            formCrearUsuario.reset();
            cargarUsuarios();
        } catch (error) {
            alert("Error al crear usuario: " + error.message);
            console.error("Error creación usuario:", error);
        }
    });

    // Cargar lista de usuarios
    async function cargarUsuarios() {
        try {
            const usuarios = await getUsuarios();
            usuariosLista.innerHTML = "";
            
            if (usuarios.length === 0) {
                usuariosLista.innerHTML = `<li class="sin-usuarios">No hay usuarios registrados</li>`;
                return;
            }
            
            usuarios.forEach((user) => {
                const li = document.createElement("li");
                li.className = "usuario-item";
                li.innerHTML = `
                    <div class="usuario-info">
                        <h4>${user.email}</h4>
                        <p>Rol: <span class="rol-badge ${user.rol}">${formatearRol(user.rol)}</span></p>
                        <p>Creado: ${user.fechaCreacion?.toDate?.().toLocaleDateString() || 'N/A'}</p>
                    </div>
                    <button class="btn-eliminar" data-id="${user.id}">Eliminar</button>
                `;
                usuariosLista.appendChild(li);
                
                const btnEliminar = li.querySelector('.btn-eliminar');
                btnEliminar.addEventListener('click', async () => {
                    if (confirm(`¿Eliminar el usuario ${user.email}?`)) {
                        try {
                            await eliminarUsuario(user.id);
                            alert(`Usuario ${user.email} eliminado de Firestore.`);
                            cargarUsuarios();
                        } catch (error) {
                            console.error("Error al eliminar usuario:", error);
                            alert("No se pudo eliminar el usuario.");
                        }
                    }
                });
            });
        } catch (error) {
            console.error("Error al cargar usuarios:", error);
            usuariosLista.innerHTML = `<li>Error al cargar usuarios</li>`;
        }
    }

    function formatearRol(rol) {
        const roles = { 'admin': 'Administrador', 'pos': 'Punto de Venta', 'cocina': 'Cocina' };
        return roles[rol] || rol;
    }

    // Dibujar pedidos filtrados por fecha
    function dibujarPedidos(pedidos) {
        const hoy = filtroFecha.value ? new Date(filtroFecha.value) : new Date();
        hoy.setHours(0,0,0,0);
        const finDia = new Date(hoy);
        finDia.setHours(23,59,59,999);

        const pedidosFiltrados = pedidos.filter(p => {
            const fechaPedido = p.fecha?.toDate?.() || new Date();
            return fechaPedido >= hoy && fechaPedido <= finDia;
        });

        // 🔹 Guardamos los pedidos actuales para imprimir después
        pedidosActuales = pedidosFiltrados;

        pedidosCocina.innerHTML = pedidosFiltrados.length === 0
            ? "<p>No hay pedidos para esta fecha</p>"
            : "";

        pedidosFiltrados.forEach(pedido => {
            const div = document.createElement("div");
            div.className = `pedido-cocina ${pedido.estado}`;
            div.innerHTML = `
                <h3>Mesa ${pedido.mesa}</h3>
                <span>Estado: ${formatearEstado(pedido.estado)}</span>
                <p>Observación: ${pedido.observacion || '-'}</p>
                <ul>${pedido.items.map(i => `<li>${i.nombre} x${i.cantidad || 1} - $${i.precio}</li>`).join('')}</ul>
                <p>Total: $${pedido.total}</p>
                <p>Fecha: ${pedido.fecha?.toDate?.().toLocaleString() || '-'}</p>
            `;
            pedidosCocina.appendChild(div);
        });
    }

    function formatearEstado(estado) {
        const estados = { 'pendiente':'PENDIENTE', 'en_preparacion':'EN PREPARACIÓN', 'completado':'COMPLETADO' };
        return estados[estado] || estado;
    }

    filtroFecha.addEventListener("change", () => observarPedidos(dibujarPedidos));
    btnRecargar.addEventListener("click", () => {
        filtroFecha.value = "";
        observarPedidos(dibujarPedidos);
    });

    // Imprimir en PDF (navegador)
    btnImprimirPDF.addEventListener("click", () => {
        window.print();
    });

    // Imprimir en formato Ticket
    btnImprimirTicket.addEventListener("click", () => {
        if (!pedidosActuales || pedidosActuales.length === 0) {
            alert("No hay pedidos para imprimir.");
            return;
        }

        const ticketWindow = window.open('', 'Ticket', 'height=600,width=300');
        ticketWindow.document.write('<html><head><title>Ticket de Pedidos</title>');
        ticketWindow.document.write('<style>');
        ticketWindow.document.write(`
            body { font-family: monospace; margin: 5px; }
            h2, h3 { text-align: center; margin: 2px 0; }
            .pedido { border-bottom: 1px dashed #000; margin-bottom: 5px; padding-bottom: 5px; }
            .estado { text-align: center; font-size: 12px; padding: 2px 5px; border-radius: 3px; color: #fff; margin-bottom: 3px; display: inline-block; }
            .pendiente { background-color: #f0ad4e; }
            .en_preparacion { background-color: #5bc0de; }
            .completado { background-color: #5cb85c; }
            ul { list-style: none; padding: 0; margin: 0; font-size: 12px; }
            li { display: flex; justify-content: space-between; margin-bottom: 2px; }
            .total { text-align: right; font-weight: bold; margin-top: 5px; }
            .observacion { font-size: 12px; margin-top: 3px; }
            .fecha { text-align: center; font-size: 12px; margin: 5px 0; }
            hr { border: none; border-top: 1px dashed #000; margin: 5px 0; }
        `);
        ticketWindow.document.write('</style></head><body>');

        ticketWindow.document.write(`<h2>Jardín de Edith</h2>`);
        ticketWindow.document.write(`<div class="fecha">Fecha: ${new Date().toLocaleString('es-MX')}</div>`);
        ticketWindow.document.write('<hr>');

        let totalGeneral = 0;

        pedidosActuales.forEach(pedido => {
            totalGeneral += pedido.total || 0;
            ticketWindow.document.write('<div class="pedido">');
            ticketWindow.document.write(`<h3>Mesa ${pedido.mesa}</h3>`);
            ticketWindow.document.write(`<div class="estado ${pedido.estado}">${formatearEstado(pedido.estado)}</div>`);
            ticketWindow.document.write('<ul>');
            pedido.items.forEach(item => {
                ticketWindow.document.write(`<li>${item.nombre} x${item.cantidad || 1} - $${(item.precio * (item.cantidad || 1)).toFixed(2)}</li>`);
            });
            ticketWindow.document.write('</ul>');
            ticketWindow.document.write(`<div class="total">Total: $${pedido.total?.toFixed(2) || '0.00'}</div>`);
            if(pedido.observacion) ticketWindow.document.write(`<div class="observacion">Obs: ${pedido.observacion}</div>`);
            ticketWindow.document.write('</div>');
        });

        ticketWindow.document.write('<hr>');
        ticketWindow.document.write(`<div class="total">TOTAL GENERAL: $${totalGeneral.toFixed(2)}</div>`);
        ticketWindow.document.write('<div style="text-align:center; margin-top:5px;">¡Gracias por su preferencia!</div>');

        ticketWindow.document.write('</body></html>');
        ticketWindow.document.close();
        ticketWindow.focus();
        ticketWindow.print();
        ticketWindow.close();
    });

    // Tabs
    const tabs = document.querySelectorAll(".admin-tab");
    const contents = document.querySelectorAll(".admin-tab-content");
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            contents.forEach(c => c.classList.remove("active"));
            tab.classList.add("active");
            document.getElementById(tab.dataset.tab).classList.add("active");
        });
    });
});