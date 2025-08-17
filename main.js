import { guardarPedidoEnDB } from './database.js';


const menu = {
    comidas: [
        { id: 1, nombre: "Pasta Carbonara", precio: 12.99, ingredientes: ["pasta", "huevo", "panceta", "queso"] },
        { id: 2, nombre: "Pizza Margarita", precio: 10.99, ingredientes: ["masa", "salsa", "mozzarella", "albahaca"] },
        { id: 3, nombre: "Ensalada César", precio: 8.99, ingredientes: ["lechuga", "crutones", "salsa", "parmesano"] }
    ],
    bebidas: [
        { id: 4, nombre: "Refresco", precio: 2.50, ingredientes: [] },
        { id: 5, nombre: "Cerveza", precio: 3.50, ingredientes: [] },
        { id: 6, nombre: "Agua Mineral", precio: 1.50, ingredientes: [] }
    ],
    postres: [
        { id: 7, nombre: "Tarta de Chocolate", precio: 5.99, ingredientes: ["chocolate", "harina", "huevo", "azúcar"] },
        { id: 8, nombre: "Helado", precio: 3.99, ingredientes: ["leche", "azúcar", "vainilla"] },
        { id: 9, nombre: "Fruta Fresca", precio: 4.50, ingredientes: [] }
    ],
    especiales: [
        { id: 10, nombre: "Menú del Chef", precio: 15.99, ingredientes: ["plato del día", "postre", "bebida"] },
        { id: 11, nombre: "Menú del Chef especial", precio: 35.00, ingredientes: ["plato del día", "postre", "bebida", "vinos"] }
    ]
};

let pedido = [];
let mesaSeleccionada = 1;


function cargarMenu() {
    for (const categoria in menu) {
        const container = document.getElementById(categoria);
        container.innerHTML = '';
        
        menu[categoria].forEach(item => {
            const div = document.createElement('div');
            div.className = 'menu-item';
            div.innerHTML = `
                <div class="menu-item-info">
                    <span class="menu-item-nombre">${item.nombre}</span>
                    ${item.ingredientes.length ? `<span class="menu-item-ingredientes">${item.ingredientes.join(', ')}</span>` : ''}
                </div>
                <span class="menu-item-precio">$${item.precio.toFixed(2)}</span>
                <button class="btn-add" data-id="${item.id}">
                    <i class="fas fa-plus"></i> Añadir
                </button>
            `;
            container.appendChild(div);
        });
    }
}


function openCategory(categoria) {
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
    });
    
    const content = document.getElementById(categoria);
    if (content) content.style.display = 'block';
    
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    const activeTab = document.querySelector(`.tab[data-categoria="${categoria}"]`);
    if (activeTab) activeTab.classList.add('active');
}


function agregarAlPedido(id) {
    let itemEncontrado = null;
    for (const categoria in menu) {
        itemEncontrado = menu[categoria].find(item => item.id === id);
        if (itemEncontrado) break;
    }
    
    if (!itemEncontrado) return;
    
    const itemEnPedido = pedido.find(item => item.id === id);
    
    if (itemEnPedido) {
        itemEnPedido.cantidad = (itemEnPedido.cantidad || 1) + 1;
    } else {
        pedido.push({
            ...itemEncontrado,
            cantidad: 1
        });
    }
    
    actualizarCarrito();
}


function actualizarCarrito() {
    const lista = document.getElementById('lista-pedido');
    const totalElement = document.getElementById('total');
    
    lista.innerHTML = '';
    let total = 0;
    
    pedido.forEach(item => {
        const subtotal = item.precio * (item.cantidad || 1);
        total += subtotal;
        
        const li = document.createElement('li');
        li.className = 'pedido-item';
        li.innerHTML = `
            <span class="pedido-nombre">${item.nombre} x${item.cantidad || 1}</span>
            <span class="pedido-precio">$${subtotal.toFixed(2)}</span>
            <button class="btn-eliminar" data-id="${item.id}">
                <i class="fas fa-trash"></i>
            </button>
        `;
        lista.appendChild(li);
    });
    
    totalElement.textContent = total.toFixed(2);
}


function eliminarDelPedido(id) {
    pedido = pedido.filter(item => item.id !== id);
    actualizarCarrito();
}


async function enviarPedido() {
    if (pedido.length === 0) {
        alert("¡El pedido está vacío!");
        return;
    }

    const user = firebase.auth().currentUser;
    if (!user) {
        alert("Debes iniciar sesión para enviar pedidos");
        window.location.href = "index.html";
        return;
    }

    const mesaSeleccionada = document.getElementById("mesa").value;
    const observacion = document.getElementById("observacion").value.trim();

    if (!mesaSeleccionada) {
        alert("Por favor selecciona una mesa.");
        return;
    }

    const btn = document.getElementById('btn-enviar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    try {
        const fechaLocal = new Date();
        
        const pedidoData = {
            mesa: parseInt(mesaSeleccionada),
            items: pedido.map(item => ({
                nombre: item.nombre,
                precio: item.precio,
                cantidad: item.cantidad || 1,
                ingredientes: item.ingredientes || []
            })),
            total: parseFloat(document.getElementById("total").textContent),
            estado: "pendiente",
            observacion: observacion || "",
            fecha: firebase.firestore.FieldValue.serverTimestamp(),
            fechaLocal: fechaLocal.toISOString(),
            // Datos del usuario que creó el pedido
            usuarioId: user.uid,
            usuarioEmail: user.email,
            usuarioNombre: user.displayName || "Punto de Venta"
        };

        await guardarPedidoEnDB(pedidoData);
        alert(`✅ Pedido de Mesa ${mesaSeleccionada} enviado correctamente`);
        pedido = [];
        actualizarCarrito();
        document.getElementById("mesa").value = "";
        document.getElementById("observacion").value = "";
    } catch (error) {
        console.error("Error al enviar pedido:", error);
        alert("❌ Error al enviar pedido: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Enviar a Cocina';
    }
}



function configurarEventos() {
    document.addEventListener('click', function(e) {
        const btnAdd = e.target.closest('.btn-add');
        if (btnAdd) {
            const id = parseInt(btnAdd.getAttribute('data-id'));
            if (!isNaN(id)) agregarAlPedido(id);
        }
        
        const btnEliminar = e.target.closest('.btn-eliminar');
        if (btnEliminar) {
            const id = parseInt(btnEliminar.getAttribute('data-id'));
            if (!isNaN(id)) eliminarDelPedido(id);
        }
    });

   
    document.getElementById('mesa').addEventListener('change', function() {
        mesaSeleccionada = this.value;
        document.getElementById('numero-mesa').textContent = this.value;
    });

   
    document.getElementById('btn-enviar').addEventListener('click', enviarPedido);


    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const categoria = this.getAttribute('data-categoria');
            openCategory(categoria);
        });
    });
}


document.addEventListener('DOMContentLoaded', function() {
    cargarMenu();
    configurarEventos();
    openCategory('comidas');
});