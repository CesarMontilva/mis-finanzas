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
let paginaDeudas = 1;
let deudasPorPagina = 10;
let mensualEnEdicion = null;
let pagoMensualPendiente = null;
let fechaMensualMostrada = "";
// null sigue el mes actual; un mes elegido se mantiene al navegar o guardar.
let mesMensualSeleccionado = null;

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
  const recurrentes = datos.gastosMensuales === undefined ? [] : datos.gastosMensuales;
  if (!Array.isArray(recurrentes) || recurrentes.length > 5000) {
    throw new Error("La lista de gastos mensuales no es válida.");
  }
  const gastosMensuales = recurrentes.map((g) => {
    if (!g || !textoValido(g.descripcion, 100) || !valorValido(g.valor) ||
        !Number.isInteger(g.dia) || g.dia < 1 || g.dia > 31 ||
        !Array.isArray(g.pagos) || g.pagos.length > 1200) {
      throw new Error("Hay un gasto mensual con datos incorrectos.");
    }
    const meses = new Set();
    const pagos = g.pagos.map((p) => {
      if (!p || !fechaValida(p.fecha) || typeof p.mes !== "string" || !fechaValida(`${p.mes}-01`) ||
          !valorValido(p.valor) || meses.has(p.mes)) {
        throw new Error("Hay un pago mensual con datos incorrectos o repetidos.");
      }
      meses.add(p.mes);
      return { mes: p.mes, fecha: p.fecha, valor: p.valor };
    });
    return { descripcion: g.descripcion, valor: g.valor, dia: g.dia, pagos };
  });
  return { movimientos, deudas, gastosMensuales };
}

function cargarEstado() {
  try {
    const texto = localStorage.getItem(CLAVE_DATOS);
    datosLeidos = texto;
    return texto === null ? { movimientos: [], deudas: [], gastosMensuales: [] } : validarEstado(JSON.parse(texto));
  } catch (error) {
    lecturaBloqueada = true;
    avisar("No se pudieron leer los datos. Para protegerlos, el guardado está bloqueado. " +
      "Conserva una copia y revisa el problema antes de continuar.");
    console.error(error);
    return { movimientos: [], deudas: [], gastosMensuales: [] };
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
  $("seccion-deudas").querySelectorAll(".deuda").forEach((fila) => {
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
  renderizarMensuales();
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
  if (!guardarEstado({ ...estado, movimientos, deudas })) {
    $("error-pregunta-deuda").textContent = $("aviso").textContent;
    $("error-pregunta-deuda").hidden = false;
    return;
  }
  // Se consume la operación antes de cerrar para impedir dobles registros.
  operacionDeudaPendiente = null;
  $("pregunta-deuda").close();
  if (accion === "crear") {
    $("formulario-deuda").reset();
    cambiarFormularioDeuda(false);
    $("alternar-nueva-deuda").focus();
  } else {
    avisar("Deuda saldada. Puedes consultarla en el historial de deudas.");
    $("alternar-historial-deudas").focus();
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
function cambiarFormularioDeuda(abierto) {
  $("nueva-deuda").hidden = !abierto;
  $("alternar-nueva-deuda").setAttribute("aria-expanded", String(abierto));
  $("alternar-nueva-deuda").textContent = abierto ? "Ocultar formulario" : "Añadir";
}
$("alternar-nueva-deuda").addEventListener("click", () => {
  const abrir = $("nueva-deuda").hidden;
  cambiarFormularioDeuda(abrir);
  if (abrir) $("persona-deuda").focus();
});
$("historial-deudas").addEventListener("toggle", () => {
  if (!$("historial-deudas").open) cerrarSelecciones();
});
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
  const indiceEditado = deudaEnEdicion;
  if (guardarEstado({ ...estado, deudas })) {
    $("editor-deuda").close();
    $(`deuda-${indiceEditado}`)?.focus();
  } else {
    $("error-editar-deuda").textContent = $("aviso").textContent;
    $("error-editar-deuda").hidden = false;
  }
});

$("cantidad-deudas-saldadas").addEventListener("change", (evento) => {
  const cantidad = Number(evento.target.value);
  if (![10, 25, 50].includes(cantidad)) return;
  deudasPorPagina = cantidad;
  paginaDeudas = 1;
  renderizarDeudas();
});
$("pagina-deudas-anterior").addEventListener("click", () => {
  if (paginaDeudas <= 1) return;
  paginaDeudas--;
  renderizarDeudas();
});
$("pagina-deudas-siguiente").addEventListener("click", () => {
  const total = estado.deudas.filter((d) => d.saldada).length;
  if (paginaDeudas * deudasPorPagina >= total) return;
  paginaDeudas++;
  renderizarDeudas();
});

function renderizarDeudas() {
  let meDeben = 0, yoDebo = 0;
  const total = estado.deudas.filter((d) => d.saldada).length;
  const paginas = Math.max(1, Math.ceil(total / deudasPorPagina));
  paginaDeudas = Math.min(Math.max(1, paginaDeudas), paginas);
  const inicio = (paginaDeudas - 1) * deudasPorPagina;
  const fin = Math.min(inicio + deudasPorPagina, total);
  let posicionSaldada = 0;
  $("lista-deudas").replaceChildren();
  $("lista-deudas-saldadas").replaceChildren();
  estado.deudas.forEach((d, indice) => {
    if (!d.saldada) {
      if (d.sentido === "me_deben") meDeben += d.valor;
      else yoDebo += d.valor;
    } else {
      const posicion = posicionSaldada++;
      if (posicion < inicio || posicion >= fin) return;
    }
    const fila = document.createElement("li");
    fila.className = d.saldada ? "deuda deuda-saldada" : "deuda";
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
    contenido.id = `deuda-${indice}`;
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
    $(d.saldada ? "lista-deudas-saldadas" : "lista-deudas").append(fila);
  });
  $("total-me-deben").textContent = moneda.format(meDeben);
  $("total-yo-debo").textContent = moneda.format(yoDebo);
  $("sin-deudas").hidden = estado.deudas.some((d) => !d.saldada);
  $("sin-historial-deudas").hidden = estado.deudas.some((d) => d.saldada);
  $("paginacion-deudas").hidden = total === 0;
  $("estado-pagina-deudas").textContent = total === 0 ? "" :
    `${inicio + 1}–${fin} de ${total} · Página ${paginaDeudas} de ${paginas}`;
  $("pagina-deudas-anterior").disabled = paginaDeudas === 1;
  $("pagina-deudas-siguiente").disabled = paginaDeudas === paginas;
}

function vencimientoMensual(mes, dia) {
  const [anio, numeroMes] = mes.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate();
  return `${mes}-${String(Math.min(dia, ultimoDia)).padStart(2, "0")}`;
}

function desplazarMesMensual(desplazamiento) {
  const mes = mesMensualSeleccionado || fechaActual().slice(0, 7);
  const fecha = new Date(`${mes}-01T00:00:00Z`);
  fecha.setUTCMonth(fecha.getUTCMonth() + desplazamiento);
  const anio = fecha.getUTCFullYear();
  if (anio < 100 || anio > 9999) return;
  mesMensualSeleccionado = fecha.toISOString().slice(0, 7);
  renderizarMensuales();
}
$("mes-anterior").addEventListener("click", () => desplazarMesMensual(-1));
$("mes-siguiente").addEventListener("click", () => desplazarMesMensual(1));
$("volver-mes-actual").addEventListener("click", () => {
  mesMensualSeleccionado = null;
  renderizarMensuales();
});

function renderizarMensuales() {
  const hoy = fechaActual();
  const mes = mesMensualSeleccionado || hoy.slice(0, 7);
  fechaMensualMostrada = hoy;
  $("mes-mensuales").textContent = new Intl.DateTimeFormat("es-CO", {
    month: "long", year: "numeric", timeZone: "UTC"
  }).format(new Date(`${mes}-01T00:00:00Z`));
  let pendiente = 0, pagado = 0;
  $("lista-mensuales").replaceChildren();
  estado.gastosMensuales.forEach((g, indice) => {
    const pago = g.pagos.find((p) => p.mes === mes);
    const vencimiento = vencimientoMensual(mes, g.dia);
    if (pago) pagado += pago.valor;
    else pendiente += g.valor;
    const fila = document.createElement("li");
    fila.className = `gasto-mensual${pago ? " mensual-pagado" : ""}`;
    const cabecera = document.createElement("div");
    cabecera.className = "cabecera-deuda";
    const descripcion = document.createElement("strong");
    descripcion.textContent = g.descripcion;
    const importe = document.createElement("strong");
    importe.textContent = moneda.format(pago ? pago.valor : g.valor);
    cabecera.append(descripcion, importe);
    const detalle = document.createElement("p");
    detalle.className = "detalle-deuda";
    detalle.textContent = pago
      ? `Pagado el ${formatoFecha.format(new Date(`${pago.fecha}T00:00:00Z`))}`
      : `Vence el ${formatoFecha.format(new Date(`${vencimiento}T00:00:00Z`))}`;
    const etiqueta = document.createElement("span");
    etiqueta.className = "etiqueta";
    etiqueta.textContent = pago ? "Pagado" : vencimiento < hoy ? "Vencido" : vencimiento === hoy ? "Vence hoy" : "Pendiente";
    if (!pago && vencimiento <= hoy) etiqueta.classList.add("mensual-vencido");
    const acciones = document.createElement("div");
    acciones.className = "acciones-movimiento";
    if (!pago) {
      acciones.append(crearBoton("Pagar", "", () => preguntarPagoMensual(indice)));
    }
    acciones.append(
      crearBoton("Editar", "boton-cancelar", () => abrirFormularioMensual(indice)),
      crearBoton("Eliminar", "boton-eliminar", () => {
        if (!window.confirm(`¿Eliminar «${g.descripcion}» de tus gastos recurrentes? Sus transacciones ya registradas se conservarán.`)) return;
        if (guardarEstado({ ...estado, gastosMensuales: estado.gastosMensuales.filter((_, i) => i !== indice) })) {
          cerrarFormularioMensual();
          $("abrir-mensual").focus();
        }
      })
    );
    fila.append(cabecera, detalle, etiqueta, acciones);
    $("lista-mensuales").append(fila);
  });
  $("mensuales-pendiente").textContent = moneda.format(pendiente);
  $("mensuales-pagado").textContent = moneda.format(pagado);
  $("sin-mensuales").hidden = estado.gastosMensuales.length > 0;
}

function preguntarPagoMensual(indice) {
  if (pagoMensualPendiente) return;
  const gasto = estado.gastosMensuales[indice];
  const mes = mesMensualSeleccionado || fechaActual().slice(0, 7);
  if (!gasto || gasto.pagos.some((p) => p.mes === mes)) return;
  if (lecturaBloqueada) { avisar("Resuelve el error de lectura antes de registrar pagos."); return; }
  pagoMensualPendiente = { indice, mes };
  const nombreMes = new Intl.DateTimeFormat("es-CO", {
    month: "long", year: "numeric", timeZone: "UTC"
  }).format(new Date(`${mes}-01T00:00:00Z`));
  $("detalle-pregunta-mensual").textContent = `${gasto.descripcion} · ${moneda.format(gasto.valor)} · ${nombreMes}. Si eliges No, quedará pagado sin añadir una transacción.`;
  $("error-pregunta-mensual").hidden = true;
  $("pregunta-mensual").showModal();
  $("mensual-si").focus();
}

function resolverPagoMensual(incluirMovimiento) {
  if (!pagoMensualPendiente) return;
  const { indice, mes } = pagoMensualPendiente;
  if (pagarMensual(indice, incluirMovimiento, mes)) {
    pagoMensualPendiente = null;
    $("pregunta-mensual").close();
    $("abrir-mensual").focus();
  } else {
    $("error-pregunta-mensual").textContent = $("aviso").textContent || "No se pudo registrar este pago. Cierra la ventana y revisa el gasto.";
    $("error-pregunta-mensual").hidden = false;
  }
}
$("mensual-si").addEventListener("click", () => resolverPagoMensual(true));
$("mensual-no").addEventListener("click", () => resolverPagoMensual(false));
$("cancelar-pregunta-mensual").addEventListener("click", () => {
  pagoMensualPendiente = null;
  $("pregunta-mensual").close();
});
$("pregunta-mensual").addEventListener("cancel", () => { pagoMensualPendiente = null; });
$("pregunta-mensual").addEventListener("close", () => {
  if (!$("pregunta-mensual").open) pagoMensualPendiente = null;
});

function pagarMensual(indice, incluirMovimiento, mesConfirmado = null) {
  const fecha = fechaActual();
  const mes = mesConfirmado || mesMensualSeleccionado || fecha.slice(0, 7);
  if (!mesConfirmado && mesMensualSeleccionado === null && fechaMensualMostrada.slice(0, 7) !== mes) {
    renderizarMensuales();
    avisar("Ha comenzado un nuevo mes. Revisa la lista y vuelve a seleccionar el pago.");
    return;
  }
  const gasto = estado.gastosMensuales[indice];
  if (!gasto || gasto.pagos.some((p) => p.mes === mes)) return;
  const gastosMensuales = estado.gastosMensuales.map((g, i) => i === indice
    ? { ...g, pagos: [...g.pagos, { mes, fecha, valor: g.valor }] } : g);
  const movimientos = incluirMovimiento ? [...estado.movimientos, {
    tipo: "gasto", descripcion: `${gasto.descripcion.slice(0, 90)} · ${mes}`, valor: gasto.valor, fecha
  }] : estado.movimientos;
  if (guardarEstado({ ...estado, movimientos, gastosMensuales })) {
    avisar(incluirMovimiento ? "Pago registrado en el historial de transacciones." : "Marcado como pagado sin añadir otra transacción.");
    return true;
  }
  return false;
}

function abrirFormularioMensual(indice = null) {
  mensualEnEdicion = indice;
  const gasto = indice === null ? null : estado.gastosMensuales[indice];
  $("formulario-mensual").reset();
  $("titulo-formulario-mensual").textContent = gasto ? "Editar gasto mensual" : "Nuevo gasto mensual";
  if (gasto) {
    $("descripcion-mensual").value = gasto.descripcion;
    $("valor-mensual").value = gasto.valor;
    $("dia-mensual").value = gasto.dia;
  }
  $("formulario-mensual").hidden = false;
  $("abrir-mensual").setAttribute("aria-expanded", "true");
  $("descripcion-mensual").focus();
}

function cerrarFormularioMensual() {
  mensualEnEdicion = null;
  $("formulario-mensual").hidden = true;
  $("abrir-mensual").setAttribute("aria-expanded", "false");
}
$("abrir-mensual").addEventListener("click", () => abrirFormularioMensual());
$("cancelar-mensual").addEventListener("click", () => {
  cerrarFormularioMensual();
  $("abrir-mensual").focus();
});
$("formulario-mensual").addEventListener("submit", (evento) => {
  evento.preventDefault();
  if (mensualEnEdicion !== null && !estado.gastosMensuales[mensualEnEdicion]) return;
  const gasto = {
    descripcion: $("descripcion-mensual").value.trim(),
    valor: Number($("valor-mensual").value), dia: Number($("dia-mensual").value),
    pagos: mensualEnEdicion === null ? [] : estado.gastosMensuales[mensualEnEdicion].pagos
  };
  const gastosMensuales = mensualEnEdicion === null ? [...estado.gastosMensuales, gasto]
    : estado.gastosMensuales.map((g, i) => i === mensualEnEdicion ? gasto : g);
  if (guardarEstado({ ...estado, gastosMensuales })) {
    cerrarFormularioMensual();
    $("abrir-mensual").focus();
  }
});

// Cambiar de mes no escribe ni duplica gastos: se consulta el pago de cada mes.
function actualizarMesVisible() {
  if (fechaActual() !== fechaMensualMostrada) renderizarMensuales();
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) actualizarMesVisible();
});
setInterval(actualizarMesVisible, 60000);

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
  const copia = { version: 3, fechaDeCopia: new Date().toISOString(), ...estado };
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
    if (!copia || ![1, 2, 3].includes(copia.version)) throw new Error("Copia no compatible.");
    if (copia.version === 3 && !Array.isArray(copia.gastosMensuales)) throw new Error("Faltan los gastos mensuales de la copia.");
    const siguiente = validarEstado({ movimientos: copia.movimientos,
      deudas: copia.version === 1 ? estado.deudas : copia.deudas,
      gastosMensuales: copia.version === 3 ? copia.gastosMensuales : estado.gastosMensuales });
    const mensaje = copia.version === 1
      ? "Esta copia antigua reemplazará los movimientos y conservará las deudas y los gastos mensuales actuales. ¿Continuar?"
      : copia.version === 2
        ? "Esta copia reemplazará movimientos y deudas, y conservará los gastos mensuales actuales. ¿Continuar?"
        : "Esta copia reemplazará movimientos, deudas y gastos mensuales, incluidos sus pagos. ¿Continuar?";
    if (!window.confirm(mensaje)) return;
    if (guardarEstado(siguiente)) {
      cerrarFormularioMensual();
      avisar("Copia recuperada correctamente.");
    }
  } catch (error) {
    avisar("No se pudo recuperar la copia. " + error.message);
  } finally {
    evento.target.value = "";
  }
});

renderizar();
