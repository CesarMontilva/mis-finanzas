"use strict";

// Conservamos la clave original para recuperar los movimientos anteriores.
const CLAVE_DATOS = "mis-finanzas-movimientos";
const MAX_VALOR = 1000000000000;
const $ = (id) => document.getElementById(id);
const moneda = new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", maximumFractionDigits: 0
});
const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  day: "numeric", month: "long", timeZone: "UTC"
});

function fechaActual() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Bogota"
  }).formatToParts(new Date());
  const parte = (tipo) => partes.find((p) => p.type === tipo).value;
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

function fechaValida(fecha) {
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const instante = new Date(`${fecha}T00:00:00Z`);
  return Number.isFinite(instante.getTime()) && instante.toISOString().slice(0, 10) === fecha;
}
let lecturaBloqueada = false;
let datosLeidos = null;
let estado = cargarEstado();
let movimientoEnEdicion = null;
let deudaEnEdicion = null;
let operacionDeudaPendiente = null;
let paginaMovimientos = 1;
let movimientosPorPagina = 10;

function avisar(texto) {
  $("aviso").textContent = texto;
  $("aviso").hidden = !texto;
}

function textoValido(texto, maximo, opcional = false) {
  return typeof texto === "string" && texto.length <= maximo &&
    (opcional || texto.trim().length > 0);
}

function valorValido(valor) {
  return Number.isSafeInteger(valor) && valor > 0 && valor <= MAX_VALOR;
}

// Admite tanto el almacenamiento antiguo (lista) como el nuevo (objeto).
function validarEstado(datos) {
  if (Array.isArray(datos)) datos = { movimientos: datos, deudas: [] };
  if (!datos || !Array.isArray(datos.movimientos) || !Array.isArray(datos.deudas)) {
    throw new Error("El archivo no tiene el formato esperado.");
  }
  if (datos.movimientos.length > 5000 || datos.deudas.length > 5000) {
    throw new Error("Se admiten hasta 5000 movimientos y 5000 deudas.");
  }
  const movimientos = datos.movimientos.map((m) => {
    if (!m || !["ingreso", "gasto"].includes(m.tipo) ||
        !textoValido(m.descripcion, 100) || !valorValido(m.valor) ||
        (m.fecha != null && !fechaValida(m.fecha))) {
      throw new Error("Hay un movimiento con datos incorrectos.");
    }
    return { tipo: m.tipo, descripcion: m.descripcion, valor: m.valor,
      ...(m.fecha != null ? { fecha: m.fecha } : {}) };
  });
  const deudas = datos.deudas.map((d) => {
    if (!d || !["me_deben", "debo"].includes(d.sentido) ||
        !textoValido(d.persona, 100) || !textoValido(d.concepto, 150, true) ||
        !valorValido(d.valor) || typeof d.saldada !== "boolean") {
      throw new Error("Hay una deuda con datos incorrectos.");
    }
    return { sentido: d.sentido, persona: d.persona, concepto: d.concepto,
      valor: d.valor, saldada: d.saldada };
  });
  return { movimientos, deudas };
}

function cargarEstado() {
  try {
    const texto = localStorage.getItem(CLAVE_DATOS);
    datosLeidos = texto;
    return texto === null ? { movimientos: [], deudas: [] } : validarEstado(JSON.parse(texto));
  } catch (error) {
    lecturaBloqueada = true;
    avisar("No se pudieron leer los datos. Para protegerlos, el guardado está bloqueado. " +
      "Conserva una copia y revisa el problema antes de continuar.");
    console.error(error);
    return { movimientos: [], deudas: [] };
  }
}

// Guardamos movimientos y deudas juntos: si falla, la pantalla conserva lo anterior.
function guardarEstado(siguiente) {
  if (lecturaBloqueada) {
    avisar("El guardado está bloqueado porque no se pudieron leer los datos anteriores.");
    return false;
  }
  try {
    const validado = validarEstado(siguiente);
    if (localStorage.getItem(CLAVE_DATOS) !== datosLeidos) {
      avisar("Los datos cambiaron en otra pestaña. Recarga esta página antes de continuar para conservar esos cambios.");
      return false;
    }
    const texto = JSON.stringify(validado);
    localStorage.setItem(CLAVE_DATOS, texto);
    datosLeidos = texto;
    if (validado.movimientos.length > estado.movimientos.length) paginaMovimientos = 1;
    estado = validado;
    avisar("");
    renderizar();
    return true;
  } catch (error) {
    avisar("No se pudo guardar. " + error.message);
    return false;
  }
}

function crearBoton(texto, clase, accion) {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.textContent = texto;
  boton.className = clase || "";
  boton.addEventListener("click", accion);
  return boton;
}

function cerrarSelecciones() {
  $("lista-movimientos").querySelectorAll(".movimiento").forEach((fila) => {
    fila.classList.remove("seleccionado");
    fila.querySelector(".acciones-movimiento").hidden = true;
    fila.querySelector(".contenido-movimiento").setAttribute("aria-expanded", "false");
  });
  $("lista-deudas").querySelectorAll(".deuda").forEach((fila) => {
    fila.classList.remove("seleccionado");
    fila.querySelector(".acciones-deuda").hidden = true;
    fila.querySelector(".contenido-deuda").setAttribute("aria-expanded", "false");
  });
}

function renderizar() {
  let ingresos = 0, gastos = 0;
  const total = estado.movimientos.length;
  const paginas = Math.max(1, Math.ceil(total / movimientosPorPagina));
  paginaMovimientos = Math.min(Math.max(1, paginaMovimientos), paginas);
  const inicio = (paginaMovimientos - 1) * movimientosPorPagina;
  const fin = Math.min(inicio + movimientosPorPagina, total);
  $("lista-movimientos").replaceChildren();
  estado.movimientos.forEach((m, indice) => {
    if (m.tipo === "ingreso") ingresos += m.valor;
    else gastos += m.valor;
    // Los totales incluyen todo el historial; solo se dibuja la página visible.
    const posicion = total - 1 - indice;
    if (posicion < inicio || posicion >= fin) return;
    const fila = document.createElement("li");
    fila.className = "movimiento";
    const contenido = crearBoton("", "contenido-movimiento", () => {
      const abrir = acciones.hidden;
      cerrarSelecciones();
      if (abrir) {
        fila.classList.add("seleccionado");
        acciones.hidden = false;
        contenido.setAttribute("aria-expanded", "true");
        editar.focus();
      }
    });
    contenido.setAttribute("aria-expanded", "false");
    contenido.id = `movimiento-${indice}`;
    const descripcion = document.createElement("span");
    descripcion.textContent = m.descripcion;
    const detalle = document.createElement("span");
    detalle.className = "detalle-movimiento";
    const fecha = document.createElement(m.fecha ? "time" : "span");
    fecha.className = "fecha-movimiento";
    fecha.textContent = m.fecha
      ? formatoFecha.format(new Date(`${m.fecha}T00:00:00Z`)) : "Sin fecha";
    if (m.fecha) fecha.dateTime = m.fecha;
    detalle.append(descripcion, fecha);
    const importe = document.createElement("strong");
    importe.textContent = (m.tipo === "ingreso" ? "+ " : "− ") + moneda.format(m.valor);
    importe.className = m.tipo;
    contenido.append(detalle, importe);
    const acciones = document.createElement("div");
    acciones.className = "acciones-movimiento";
    acciones.hidden = true;
    const editar = crearBoton("Editar", "", () => abrirEditor(indice));
    const eliminar = crearBoton("Eliminar", "boton-eliminar", () => {
      guardarEstado({ ...estado, movimientos: estado.movimientos.filter((_, i) => i !== indice) });
    });
    const cancelar = crearBoton("Cancelar", "boton-cancelar", () => {
      cerrarSelecciones(); contenido.focus();
    });
    fila.addEventListener("keydown", (evento) => {
      if (evento.key === "Escape") { cerrarSelecciones(); contenido.focus(); }
    });
    acciones.append(editar, eliminar, cancelar);
    fila.append(contenido, acciones);
    // Los últimos registros aparecen primero sin cambiar los índices guardados.
    $("lista-movimientos").prepend(fila);
  });
  $("total-ingresos").textContent = moneda.format(ingresos);
  $("total-gastos").textContent = moneda.format(gastos);
  $("saldo").textContent = moneda.format(ingresos - gastos);
  $("sin-movimientos").hidden = estado.movimientos.length > 0;
  $("paginacion-movimientos").hidden = total === 0;
  $("estado-pagina").textContent = total === 0 ? "" :
    `${inicio + 1}–${fin} de ${total} · Página ${paginaMovimientos} de ${paginas}`;
  $("pagina-anterior").disabled = paginaMovimientos === 1;
  $("pagina-siguiente").disabled = paginaMovimientos === paginas;
  renderizarDeudas();
}

$("cantidad-movimientos").addEventListener("change", (evento) => {
  const cantidad = Number(evento.target.value);
  if (![10, 25, 50].includes(cantidad)) return;
  movimientosPorPagina = cantidad;
  paginaMovimientos = 1;
  renderizar();
});
$("pagina-anterior").addEventListener("click", () => {
  if (paginaMovimientos <= 1) return;
  paginaMovimientos--;
  renderizar();
});
$("pagina-siguiente").addEventListener("click", () => {
  if (paginaMovimientos * movimientosPorPagina >= estado.movimientos.length) return;
  paginaMovimientos++;
  renderizar();
});

$("formulario").addEventListener("submit", (evento) => {
  evento.preventDefault();
  const movimiento = { tipo: evento.currentTarget.elements.tipo.value,
    descripcion: $("descripcion").value.trim(), valor: Number($("valor").value), fecha: fechaActual() };
  if (guardarEstado({ ...estado, movimientos: [...estado.movimientos, movimiento] })) {
    evento.currentTarget.reset(); $("descripcion").focus();
  }
});

function abrirEditor(indice) {
  movimientoEnEdicion = indice;
  const m = estado.movimientos[indice];
  $("formulario-editar").elements.tipo.value = m.tipo;
  $("editar-descripcion").value = m.descripcion;
  $("editar-valor").value = m.valor;
  $("error-editar-movimiento").hidden = true;
  $("editor-movimiento").showModal();
  $("editar-descripcion").focus();
}
$("cancelar-edicion").addEventListener("click", () => $("editor-movimiento").close());
$("editor-movimiento").addEventListener("close", () => { movimientoEnEdicion = null; });
$("formulario-editar").addEventListener("submit", (evento) => {
  evento.preventDefault();
  if (movimientoEnEdicion === null) return;
  const editado = { ...estado.movimientos[movimientoEnEdicion], tipo: evento.currentTarget.elements.tipo.value,
    descripcion: $("editar-descripcion").value.trim(), valor: Number($("editar-valor").value) };
  if (!textoValido(editado.descripcion, 100) || !valorValido(editado.valor)) {
    $("editar-descripcion").setCustomValidity("Revisa la descripción y el valor.");
    $("editar-descripcion").reportValidity();
    $("editar-descripcion").setCustomValidity("");
    return;
  }
  const nuevos = estado.movimientos.map((m, i) => i === movimientoEnEdicion ? editado : m);
  const indiceEditado = movimientoEnEdicion;
  if (guardarEstado({ ...estado, movimientos: nuevos })) {
    $("editor-movimiento").close();
    $(`movimiento-${indiceEditado}`)?.focus();
  } else {
    $("error-editar-movimiento").textContent = $("aviso").textContent;
    $("error-editar-movimiento").hidden = false;
  }
});

// La deuda y su movimiento opcional se guardan juntos, después de responder.
$("formulario-deuda").addEventListener("submit", (evento) => {
  evento.preventDefault();
  const deuda = { sentido: evento.currentTarget.elements.sentido.value,
    persona: $("persona-deuda").value.trim(), concepto: $("concepto-deuda").value.trim(),
    valor: Number($("valor-deuda").value), saldada: false };
  try {
    validarEstado({ ...estado, deudas: [...estado.deudas, deuda] });
    prepararOperacionDeuda("crear", deuda);
  } catch (error) {
    avisar(error.message);
  }
});

function prepararOperacionDeuda(accion, deuda, indice = null) {
  if (operacionDeudaPendiente) return;
  if (lecturaBloqueada) { avisar("Resuelve el error de lectura antes de modificar las deudas."); return; }
  if (accion === "saldar" && (!estado.deudas[indice] || estado.deudas[indice].saldada)) return;
  const tipo = accion === "crear"
    ? (deuda.sentido === "me_deben" ? "gasto" : "ingreso")
    : (deuda.sentido === "me_deben" ? "ingreso" : "gasto");
  operacionDeudaPendiente = { accion, deuda: { ...deuda }, indice, tipo };
  $("titulo-pregunta-deuda").textContent = `¿Deseas añadir esto como ${tipo}?`;
  $("detalle-pregunta-deuda").textContent = `${deuda.persona} · ${moneda.format(deuda.valor)}. ` +
    (accion === "crear"
      ? "Si eliges No, se guardará únicamente la deuda."
      : "Si eliges No, la deuda quedará saldada sin crear un movimiento.");
  $("deuda-no").textContent = accion === "crear" ? "No, solo la deuda" : "No, solo saldar";
  $("error-pregunta-deuda").hidden = true;
  $("pregunta-deuda").showModal();
  $("deuda-si").focus();
}

function resolverOperacionDeuda(incluirMovimiento) {
  const operacion = operacionDeudaPendiente;
  if (!operacion) return;
  const { accion, deuda, indice, tipo } = operacion;
  if (accion === "saldar" && (!estado.deudas[indice] || estado.deudas[indice].saldada)) {
    operacionDeudaPendiente = null;
    $("pregunta-deuda").close();
    return;
  }
  const deudas = accion === "crear"
    ? [...estado.deudas, deuda]
    : estado.deudas.map((d, i) => i === indice ? { ...d, saldada: true } : d);
  let movimientos = estado.movimientos;
  if (incluirMovimiento) {
    const descripcion = accion === "crear"
      ? (deuda.sentido === "me_deben" ? "Préstamo a " : "Préstamo recibido de ") + deuda.persona
      : (deuda.sentido === "me_deben" ? "Cobro a " : "Pago de deuda a ") + deuda.persona;
    movimientos = [...movimientos, { tipo, descripcion: descripcion.slice(0, 100),
      valor: deuda.valor, fecha: fechaActual() }];
  }
  if (!guardarEstado({ movimientos, deudas })) {
    $("error-pregunta-deuda").textContent = $("aviso").textContent;
    $("error-pregunta-deuda").hidden = false;
    return;
  }
  // Se consume la operación antes de cerrar para impedir dobles registros.
  operacionDeudaPendiente = null;
  $("pregunta-deuda").close();
  if (accion === "crear") {
    $("formulario-deuda").reset();
    $("persona-deuda").focus();
  } else {
    $("lista-deudas").querySelectorAll(".contenido-deuda")[indice]?.focus();
  }
}

$("deuda-si").addEventListener("click", () => resolverOperacionDeuda(true));
$("deuda-no").addEventListener("click", () => resolverOperacionDeuda(false));
$("cancelar-pregunta-deuda").addEventListener("click", () => {
  operacionDeudaPendiente = null;
  $("pregunta-deuda").close();
});
$("pregunta-deuda").addEventListener("cancel", () => { operacionDeudaPendiente = null; });
$("pregunta-deuda").addEventListener("close", () => {
  if (!$("pregunta-deuda").open) operacionDeudaPendiente = null;
});

function abrirEditorDeuda(indice) {
  const deuda = estado.deudas[indice];
  if (!deuda) return;
  deudaEnEdicion = indice;
  $("formulario-editar-deuda").elements.sentido.value = deuda.sentido;
  $("editar-persona-deuda").value = deuda.persona;
  $("editar-concepto-deuda").value = deuda.concepto;
  $("editar-valor-deuda").value = deuda.valor;
  $("error-editar-deuda").hidden = true;
  $("editor-deuda").showModal();
  $("editar-persona-deuda").focus();
}
$("cancelar-edicion-deuda").addEventListener("click", () => $("editor-deuda").close());
$("seccion-deudas").addEventListener("toggle", () => {
  if (!$("seccion-deudas").open) cerrarSelecciones();
});
$("editor-deuda").addEventListener("close", () => { deudaEnEdicion = null; });
$("formulario-editar-deuda").addEventListener("submit", (evento) => {
  evento.preventDefault();
  if (deudaEnEdicion === null || !estado.deudas[deudaEnEdicion]) return;
  const deuda = { ...estado.deudas[deudaEnEdicion],
    sentido: evento.currentTarget.elements.sentido.value,
    persona: $("editar-persona-deuda").value.trim(),
    concepto: $("editar-concepto-deuda").value.trim(),
    valor: Number($("editar-valor-deuda").value) };
  const deudas = estado.deudas.map((d, i) => i === deudaEnEdicion ? deuda : d);
  if (guardarEstado({ ...estado, deudas })) {
    $("editor-deuda").close();
    $("lista-deudas").querySelectorAll(".contenido-deuda")[deudaEnEdicion]?.focus();
  } else {
    $("error-editar-deuda").textContent = $("aviso").textContent;
    $("error-editar-deuda").hidden = false;
  }
});

function renderizarDeudas() {
  let meDeben = 0, yoDebo = 0;
  $("lista-deudas").replaceChildren();
  estado.deudas.forEach((d, indice) => {
    if (!d.saldada) {
      if (d.sentido === "me_deben") meDeben += d.valor;
      else yoDebo += d.valor;
    }
    const fila = document.createElement("li");
    fila.className = "deuda";
    const contenido = crearBoton("", "contenido-deuda", () => {
      const abrir = acciones.hidden;
      cerrarSelecciones();
      if (abrir) {
        fila.classList.add("seleccionado");
        acciones.hidden = false;
        contenido.setAttribute("aria-expanded", "true");
        editar.focus();
      }
    });
    contenido.setAttribute("aria-expanded", "false");
    const cabecera = document.createElement("span");
    cabecera.className = "cabecera-deuda";
    const persona = document.createElement("strong");
    persona.textContent = d.persona;
    const importe = document.createElement("strong");
    importe.textContent = moneda.format(d.valor);
    importe.className = d.sentido === "me_deben" ? "ingreso" : "gasto";
    cabecera.append(persona, importe);
    const detalle = document.createElement("span");
    detalle.className = "detalle-deuda";
    detalle.textContent = (d.sentido === "me_deben" ? "Prestar" : "Yo debo") +
      (d.concepto ? " · " + d.concepto : "");
    const etiqueta = document.createElement("span");
    etiqueta.className = "etiqueta";
    etiqueta.textContent = d.saldada ? "Saldada" : "Pendiente";
    const acciones = document.createElement("div");
    acciones.className = "acciones-deuda";
    acciones.hidden = true;
    const editar = crearBoton("Editar", "", () => abrirEditorDeuda(indice));
    const saldar = crearBoton(d.saldada ? "Saldada" : "Marcar saldada", "boton-cancelar", () => {
      prepararOperacionDeuda("saldar", estado.deudas[indice], indice);
    });
    saldar.disabled = d.saldada;
    acciones.append(
      editar, saldar,
      crearBoton("Eliminar", "boton-eliminar", () => {
        guardarEstado({ ...estado, deudas: estado.deudas.filter((_, i) => i !== indice) });
      }),
      crearBoton("Cancelar", "boton-cancelar", () => {
        cerrarSelecciones(); contenido.focus();
      })
    );
    fila.addEventListener("keydown", (evento) => {
      if (evento.key === "Escape") { cerrarSelecciones(); contenido.focus(); }
    });
    contenido.append(cabecera, detalle, etiqueta);
    fila.append(contenido, acciones);
    $("lista-deudas").append(fila);
  });
  $("total-me-deben").textContent = moneda.format(meDeben);
  $("total-yo-debo").textContent = moneda.format(yoDebo);
  $("sin-deudas").hidden = estado.deudas.length > 0;
}

function cambiarMenuCopia(abierto) {
  $("opciones-copia").hidden = !abierto;
  $("abrir-menu-copia").setAttribute("aria-expanded", String(abierto));
}
$("abrir-menu-copia").addEventListener("click", () => cambiarMenuCopia($("opciones-copia").hidden));
document.addEventListener("click", (evento) => {
  if (!evento.target.closest(".menu-copia")) cambiarMenuCopia(false);
});
document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape" && !$("opciones-copia").hidden) {
    cambiarMenuCopia(false); $("abrir-menu-copia").focus();
  }
});

$("exportar").addEventListener("click", () => {
  cambiarMenuCopia(false);
  if (lecturaBloqueada) { avisar("Revisa el error de lectura antes de generar una copia."); return; }
  const copia = { version: 2, fechaDeCopia: new Date().toISOString(), ...estado };
  const archivo = new Blob([JSON.stringify(copia, null, 2)], { type: "application/json" });
  const direccion = URL.createObjectURL(archivo);
  const enlace = document.createElement("a");
  enlace.href = direccion;
  enlace.download = `mis-finanzas-${Date.now()}.json`;
  document.body.append(enlace); enlace.click(); enlace.remove();
  setTimeout(() => URL.revokeObjectURL(direccion), 1000);
});
$("importar").addEventListener("click", () => {
  cambiarMenuCopia(false); $("archivo-copia").click();
});
$("archivo-copia").addEventListener("change", async (evento) => {
  const archivo = evento.target.files[0];
  if (!archivo) return;
  try {
    if (archivo.size > 10000000) throw new Error("La copia supera los 10 MB.");
    const copia = JSON.parse(await archivo.text());
    if (!copia || ![1, 2].includes(copia.version)) throw new Error("Copia no compatible.");
    const siguiente = validarEstado({ movimientos: copia.movimientos,
      deudas: copia.version === 1 ? estado.deudas : copia.deudas });
    const mensaje = copia.version === 1
      ? "Esta copia antigua reemplazará los movimientos y conservará las deudas actuales. ¿Continuar?"
      : "Esta copia reemplazará todos los movimientos y deudas actuales. ¿Continuar?";
    if (!window.confirm(mensaje)) return;
    if (guardarEstado(siguiente)) avisar("Copia recuperada correctamente.");
  } catch (error) {
    avisar("No se pudo recuperar la copia. " + error.message);
  } finally {
    evento.target.value = "";
  }
});

renderizar();
