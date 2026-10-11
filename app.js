// Aquí almacenaremos los movimientos mientras la página esté abierta.
const CLAVE_DATOS = "mis-finanzas-movimientos";

function cargarMovimientos() {
  try {
    const texto = localStorage.getItem(CLAVE_DATOS);

    if (texto === null) {
      return [];
    }

    const datos = JSON.parse(texto);

    if (!Array.isArray(datos)) {
      throw new Error("Los datos guardados no son una lista.");
    }

    const sonValidos = datos.every(function (movimiento) {
      return (
        movimiento !== null &&
        typeof movimiento === "object" &&
        ["ingreso", "gasto"].includes(movimiento.tipo) &&
        typeof movimiento.descripcion === "string" &&
        Number.isSafeInteger(movimiento.valor) &&
        movimiento.valor > 0
      );
    });

    if (!sonValidos) {
      throw new Error("Hay movimientos con un formato incorrecto.");
    }

    return datos;
  } catch (error) {
    console.error("No se pudieron cargar los movimientos:", error);

    alert(
      "No se pudieron leer los datos guardados. " +
      "No agregues nuevos movimientos hasta revisar el problema."
    );

    return [];
  }
}

const movimientos = cargarMovimientos();

// Buscamos los elementos de la pantalla.
const formulario = document.getElementById("formulario");
const campoTipo = document.getElementById("tipo");
const campoDescripcion = document.getElementById("descripcion");
const campoValor = document.getElementById("valor");
const lista = document.getElementById("lista-movimientos");

// Formato para mostrar pesos colombianos.
const moneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0
});

// Ejecutamos esta función al enviar el formulario.
formulario.addEventListener("submit", function (evento) {
  // Evita que el navegador recargue la página.
  evento.preventDefault();

  const tipo = campoTipo.value;
  const descripcion = campoDescripcion.value.trim();
  const valor = Number(campoValor.value);

  if (descripcion === "") {
    alert("Escribe una descripción.");
    return;
  }

  if (!Number.isSafeInteger(valor) || valor <= 0) {
    alert("Escribe un valor positivo en pesos enteros.");
    return;
  }

  // Agregamos un objeto a nuestra lista.
movimientos.push({
  tipo: tipo,
  descripcion: descripcion,
  valor: valor
});

if (!guardarMovimientos()) {
  // Retiramos el movimiento si no se pudo guardar.
  movimientos.pop();
  return;
}

actualizarPantalla();

  formulario.reset();
  campoDescripcion.focus();
});

function actualizarPantalla() {
  let ingresos = 0;
  let gastos = 0;

  // Limpiamos la lista antes de reconstruirla.
  lista.replaceChildren();

  for (const movimiento of movimientos) {
    if (movimiento.tipo === "ingreso") {
      ingresos += movimiento.valor;
    } else {
      gastos += movimiento.valor;
    }

    const fila = document.createElement("li");
fila.className = "movimiento";

const contenido = document.createElement("button");
contenido.type = "button";
contenido.className = "contenido-movimiento";
contenido.setAttribute("aria-expanded", "false");

const descripcion = document.createElement("span");
descripcion.textContent = movimiento.descripcion;

const importe = document.createElement("strong");
const signo = movimiento.tipo === "ingreso" ? "+" : "−";

importe.textContent = signo + " " + moneda.format(movimiento.valor);
importe.className = movimiento.tipo;

contenido.append(descripcion, importe);

const acciones = document.createElement("div");
acciones.className = "acciones-movimiento";
acciones.hidden = true;

const editar = document.createElement("button");
editar.type = "button";
editar.textContent = "Editar";

const eliminar = document.createElement("button");
eliminar.type = "button";
eliminar.textContent = "Eliminar";
eliminar.className = "boton-eliminar";

const cancelar = document.createElement("button");
cancelar.type = "button";
cancelar.textContent = "Cancelar";
cancelar.className = "boton-cancelar";

function cerrarAcciones() {
  fila.classList.remove("seleccionado");
  acciones.hidden = true;
  contenido.setAttribute("aria-expanded", "false");
}

contenido.addEventListener("click", function () {
  const abrir = acciones.hidden;

  // Cierra cualquier otro movimiento seleccionado.
  lista.querySelectorAll(".movimiento").forEach(function (elemento) {
    elemento.classList.remove("seleccionado");
    elemento.querySelector(".acciones-movimiento").hidden = true;
    elemento.querySelector(".contenido-movimiento")
      .setAttribute("aria-expanded", "false");
  });

  if (abrir) {
    fila.classList.add("seleccionado");
    acciones.hidden = false;
    contenido.setAttribute("aria-expanded", "true");
    editar.focus();
  }
});

cancelar.addEventListener("click", function () {
  cerrarAcciones();
  contenido.focus();
});

fila.addEventListener("keydown", function (evento) {
  if (evento.key === "Escape") {
    cerrarAcciones();
    contenido.focus();
  }
});

eliminar.addEventListener("click", function () {
    const posicion = movimientos.indexOf(movimiento);

  if (posicion === -1) {
    return;
  }

  movimientos.splice(posicion, 1);

  if (!guardarMovimientos()) {
    movimientos.splice(posicion, 0, movimiento);
    return;
  }

  actualizarPantalla();
});

editar.addEventListener("click", function () {
  abrirEditor(movimiento);
});

acciones.append(editar, eliminar, cancelar);
fila.append(contenido, acciones);
lista.append(fila);
  }

  document.getElementById("total-ingresos").textContent =
    moneda.format(ingresos);

  document.getElementById("total-gastos").textContent =
    moneda.format(gastos);

  document.getElementById("saldo").textContent =
    moneda.format(ingresos - gastos);

  document.getElementById("sin-movimientos").hidden =
    movimientos.length > 0;
}

actualizarPantalla();

function guardarMovimientos() {
  try {
    localStorage.setItem(
      CLAVE_DATOS,
      JSON.stringify(movimientos)
    );

    return true;
  } catch (error) {
    console.error("No se pudieron guardar los movimientos:", error);

    alert(
      "No se pudo guardar el movimiento. " +
      "Comprueba que el navegador permita almacenar datos."
    );

    return false;
  }
}


const botonExportar = document.getElementById("exportar");
const botonImportar = document.getElementById("importar");
const campoArchivo = document.getElementById("archivo-copia");

// Descargar los movimientos en un archivo.
botonExportar.addEventListener("click", function () {
  const copia = {
    version: 1,
    fechaDeCopia: new Date().toISOString(),
    movimientos: movimientos
  };

  const contenido = JSON.stringify(copia, null, 2);

  const archivo = new Blob([contenido], {
    type: "application/json"
  });

  const direccion = URL.createObjectURL(archivo);
  const enlace = document.createElement("a");

  enlace.href = direccion;
  enlace.download = `mis-finanzas-${Date.now()}.json`;

  document.body.append(enlace);
  enlace.click();
  enlace.remove();

  setTimeout(function () {
    URL.revokeObjectURL(direccion);
  }, 1000);
});

// Abrir el selector de archivos.
botonImportar.addEventListener("click", function () {
  campoArchivo.click();
});

// Revisar y recuperar la copia seleccionada.
campoArchivo.addEventListener("change", async function () {
  const archivo = campoArchivo.files[0];

  if (!archivo) {
    return;
  }

  try {
    const contenido = await archivo.text();
    const copia = JSON.parse(contenido);

    if (
      copia === null ||
      typeof copia !== "object" ||
      copia.version !== 1 ||
      !Array.isArray(copia.movimientos)
    ) {
      throw new Error("El archivo no es una copia compatible.");
    }

    const datosValidos = copia.movimientos.every(function (item) {
      return (
        item !== null &&
        typeof item === "object" &&
        ["ingreso", "gasto"].includes(item.tipo) &&
        typeof item.descripcion === "string" &&
        item.descripcion.trim().length > 0 &&
        item.descripcion.length <= 100 &&
        Number.isSafeInteger(item.valor) &&
        item.valor > 0 &&
        item.valor <= 1000000000000
      );
    });

    if (!datosValidos) {
      throw new Error("La copia contiene movimientos incorrectos.");
    }

    const confirmar = window.confirm(
      `La copia tiene ${copia.movimientos.length} movimientos. ` +
      "Reemplazará todos los movimientos actuales. " +
      "¿Quieres continuar?"
    );

    if (!confirmar) {
      return;
    }

    // Conservamos los datos actuales por si falla el guardado.
    const anteriores = movimientos.slice();

    movimientos.length = 0;

    for (const item of copia.movimientos) {
      movimientos.push({
        tipo: item.tipo,
        descripcion: item.descripcion,
        valor: item.valor
      });
    }

    if (!guardarMovimientos()) {
      movimientos.length = 0;

      for (const item of anteriores) {
        movimientos.push(item);
      }

      return;
    }

    actualizarPantalla();
    alert("Copia recuperada correctamente.");
  } catch (error) {
    console.error(error);
    alert("No se pudo recuperar la copia. Revisa el archivo seleccionado.");
  } finally {
    // Permite volver a seleccionar el mismo archivo.
    campoArchivo.value = "";
  }
});

const botonMenuCopia = document.getElementById("abrir-menu-copia");
const opcionesCopia = document.getElementById("opciones-copia");
const contenedorCopia = document.querySelector(".menu-copia");

function cambiarMenuCopia(abierto) {
  opcionesCopia.hidden = !abierto;
  botonMenuCopia.setAttribute("aria-expanded", String(abierto));
}

// Mostrar u ocultar las opciones.
botonMenuCopia.addEventListener("click", function () {
  cambiarMenuCopia(opcionesCopia.hidden);
});

// Cerrar al elegir una opción.
opcionesCopia.addEventListener("click", function (evento) {
  if (evento.target.closest("button")) {
    cambiarMenuCopia(false);
    botonMenuCopia.focus();
  }
});

// Cerrar al pulsar fuera del menú.
document.addEventListener("click", function (evento) {
  if (!contenedorCopia.contains(evento.target)) {
    cambiarMenuCopia(false);
  }
});

// Cerrar con la tecla Escape.
document.addEventListener("keydown", function (evento) {
  if (evento.key === "Escape" && !opcionesCopia.hidden) {
    cambiarMenuCopia(false);
    botonMenuCopia.focus();
  }
});

const editorMovimiento = document.getElementById("editor-movimiento");
const formularioEditar = document.getElementById("formulario-editar");
const editarTipo = document.getElementById("editar-tipo");
const editarDescripcion = document.getElementById("editar-descripcion");
const editarValor = document.getElementById("editar-valor");

let movimientoEnEdicion = null;

function abrirEditor(movimiento) {
  movimientoEnEdicion = movimiento;

  editarTipo.value = movimiento.tipo;
  editarDescripcion.value = movimiento.descripcion;
  editarValor.value = movimiento.valor;

  editorMovimiento.showModal();
  editarDescripcion.focus();
}

document.getElementById("cancelar-edicion")
  .addEventListener("click", function () {
    editorMovimiento.close();
  });

editorMovimiento.addEventListener("close", function () {
  movimientoEnEdicion = null;
});

formularioEditar.addEventListener("submit", function (evento) {
  evento.preventDefault();

  const descripcion = editarDescripcion.value.trim();
  const valor = Number(editarValor.value);
  const posicion = movimientos.indexOf(movimientoEnEdicion);

  if (posicion === -1) {
    alert("Ese movimiento ya no está disponible.");
    editorMovimiento.close();
    return;
  }

  if (
    descripcion === "" ||
    !Number.isSafeInteger(valor) ||
    valor <= 0 ||
    valor > 1000000000000
  ) {
    alert("Escribe una descripción y un valor válido en pesos enteros.");
    return;
  }

  const anterior = movimientos[posicion];

  movimientos[posicion] = {
    ...anterior,
    tipo: editarTipo.value,
    descripcion: descripcion,
    valor: valor
  };

  if (!guardarMovimientos()) {
    movimientos[posicion] = anterior;
    return;
  }

  editorMovimiento.close();
  actualizarPantalla();
});