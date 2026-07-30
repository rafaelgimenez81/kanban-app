// src/App.jsx
import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { db } from "./firebase";
import {
  collection,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
} from "firebase/firestore";
import { ChevronDown, ChevronUp } from "lucide-react";

import LoginPage from "./LoginPage";
import { subscribeAuth, logoutUser } from "./auth";

const ENTRADAS = ["entrada_torno", "entrada_centro", "entrada_mandriladora"];
const DESTINOS_PERMITIDOS = ["programando", "terceiro"];

function normalizeSetorKey(setor) {
  // cria chaves 'entrada_torno', 'entrada_centro', 'entrada_mandriladora'
  const s = setor.toLowerCase();
  if (s.includes("torno")) return "entrada_torno";
  if (s.includes("centro")) return "entrada_centro";
  if (s.includes("mandril")) return "entrada_mandriladora";
  // fallback
  return `entrada_${s.replace(/\s+/g, "_")}`;
}

// -------- Dias desde a entrada do cartão --------
function calcularDias(entradaISO) {
  if (!entradaISO) return 0;
  const diffMs = Date.now() - new Date(entradaISO).getTime();
  return Math.max(0, Math.floor(diffMs / 86400000));
}

// -------- Ordenação: urgente > prazo (mais próximo primeiro) > dias (mais antigo primeiro) --------
function ordenarCards(cards) {
  return [...cards].sort((a, b) => {
    if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;

    const prazoA = a.prazo ? new Date(a.prazo).getTime() : Infinity;
    const prazoB = b.prazo ? new Date(b.prazo).getTime() : Infinity;
    if (prazoA !== prazoB) return prazoA - prazoB;

    const diasA = calcularDias(a.entradaISO);
    const diasB = calcularDias(b.entradaISO);
    return diasB - diasA; // maior número de dias primeiro
  });
}

function App() {
  const setores = ["Torno CNC", "Centro de Usinagem", "Mandriladora"];

  const [user, setUser] = useState(null); // controla usuário logado
  const [columns, setColumns] = useState({
    entrada_torno: [],
    entrada_centro: [],
    entrada_mandriladora: [],
    programando: [],
    terceiro: [],
  });
  const [form, setForm] = useState({
    os: "",
    desenho: "",
    cliente: "",
    setores: [], // agora array
    prazo: "",
    urgente: false,
    materiaPrima: "",
  });
  const [editando, setEditando] = useState(null);
  const [expandedCardId, setExpandedCardId] = useState(null);

  // -------- Controle de autenticação --------
  useEffect(() => {
    const unsub = subscribeAuth((currentUser) => {
      setUser(currentUser);
    });
    return () => unsub();
  }, []);

  // -------- Carregar dados do Firestore --------
  useEffect(() => {
    if (!user) return; // só busca dados se logado
    const unsub = onSnapshot(collection(db, "cards"), (snap) => {
      const cards = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      setColumns({
        entrada_torno: ordenarCards(cards.filter((c) => c.coluna === "entrada_torno")),
        entrada_centro: ordenarCards(cards.filter((c) => c.coluna === "entrada_centro")),
        entrada_mandriladora: ordenarCards(cards.filter((c) => c.coluna === "entrada_mandriladora")),
        programando: cards.filter((c) => c.coluna === "programando"),
        terceiro: cards.filter((c) => c.coluna === "terceiro"),
      });
    });
    return () => unsub();
  }, [user]);

  // -------- Criar cartão(s) --------
  const addCard = async () => {
    if (!form.os.trim()) {
      alert("Informe a OS (campo obrigatório).");
      return;
    }

    if (!form.setores || form.setores.length === 0) {
      alert("Selecione pelo menos um setor (entrada).");
      return;
    }

    const nowISO = new Date().toISOString();

    try {
      // Para cada setor selecionado criamos um cartão independente
      for (const setor of form.setores) {
        const id = crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString() + Math.random().toString(36).slice(2);
        const coluna = normalizeSetorKey(setor);

        const card = {
          id,
          os: form.os.trim(),
          desenho: form.desenho.trim(),
          cliente: form.cliente.trim(),
          setor,
          prazo: form.prazo || "",
          urgente: !!form.urgente,
          materiaPrima: form.materiaPrima.trim(),
          programador: "",
          programStartISO: null,
          accProgramMs: 0,
          programEndISO: null,
          tempoProgramacaoHoras: null,
          entradaISO: nowISO,
          fimISO: null,
          coluna,
        };

        await setDoc(doc(collection(db, "cards"), card.id), card);
      }

      setForm({ os: "", desenho: "", cliente: "", setores: [], prazo: "", urgente: false, materiaPrima: "" });
    } catch (error) {
      console.error("Erro ao criar cartão:", error);
      alert("Falha ao criar cartão na rede.");
    }
  };

  // -------- Editar cartão --------
  const saveEdit = async () => {
    if (!editando) return;
    await updateDoc(doc(db, "cards", editando.id), editando);
    setEditando(null);
  };

  // -------- Excluir cartão --------
  const excluir = async (id) => {
    await deleteDoc(doc(db, "cards", id));
  };

  // -------- Finalizar cartão --------
  const finalizar = async (card) => {
    const fimISO = new Date().toISOString();

    // se estiver em execução, acumula
    let acc = card.accProgramMs || 0;
    if (card.programStartISO) {
      const startMs = new Date(card.programStartISO).getTime();
      if (!isNaN(startMs)) acc += Date.now() - startMs;
    }

    const tempoProgramacaoHoras = acc ? (acc / 3600000).toFixed(2) : "0.00";

    await setDoc(
      doc(db, "cards", card.id),
      { coluna: "finalizado", fimISO, accProgramMs: acc, tempoProgramacaoHoras },
      { merge: true }
    );
  };

  // ---------- Drag & Drop ----------
  const onDragEnd = async (result) => {
    const { source, destination } = result;
    if (!destination) return;

    const fromKey = source.droppableId;
    const toKey = destination.droppableId;

    // --- REGRA 1: Bloquear saída das entradas para qualquer coluna não permitida ---
    if (ENTRADAS.includes(fromKey) && !DESTINOS_PERMITIDOS.includes(toKey)) {
      return;
    }

    // --- REGRA 2: Forçar retorno para a coluna de entrada correta ---
    if (["programando", "terceiro"].includes(fromKey) && ENTRADAS.includes(toKey)) {
      const movedCard = columns[fromKey][source.index];
      const colunaCorreta = normalizeSetorKey(movedCard.setor);

      if (toKey !== colunaCorreta) {
        return; // impede o drop errado
      }
    }

    // se mesma coluna, apenas reordena
    if (fromKey === toKey) {
      const list = Array.from(columns[fromKey]);
      const [moved] = list.splice(source.index, 1);
      list.splice(destination.index, 0, moved);
      setColumns({ ...columns, [fromKey]: list });
      return;
    }

    const currentCols = columns;
    const listFrom = Array.from(currentCols[fromKey] || []);
    const listTo = Array.from(currentCols[toKey] || []);

    const moved = { ...listFrom[source.index] };
    if (!moved) return;

    // Se movendo para programando ou terceiro, pedir programador (se não tiver)
    if ((toKey === "programando" || toKey === "terceiro") && !moved.programador) {
      const resp = window.prompt("Digite o nome do programador:", moved.programador || "");
      if (!resp || !resp.trim()) return; // cancela a ação
      moved.programador = resp.trim();
    }

    // Se saindo de programando/terceiro (voltando para entrada), pausa a contagem
    const now = Date.now();
    if ((fromKey === "programando" || fromKey === "terceiro") && moved.programStartISO) {
      const startMs = new Date(moved.programStartISO).getTime();
      if (!isNaN(startMs)) {
        moved.accProgramMs = (moved.accProgramMs || 0) + (now - startMs);
      }
      moved.programStartISO = null;
    }

    // Se entrando em programando/terceiro, retoma a contagem
    if (toKey === "programando" || toKey === "terceiro") {
      if (!moved.programStartISO) moved.programStartISO = new Date(now).toISOString();
    }

    moved.coluna = toKey;
    listFrom.splice(source.index, 1);
    listTo.splice(destination.index, 0, moved);

    setColumns({
      ...currentCols,
      [fromKey]: listFrom,
      [toKey]: listTo,
    });

    await setDoc(doc(db, "cards", moved.id), moved, { merge: true });
  };

  const formatarPrazo = (prazo) => {
    if (!prazo) return "";
    return new Date(prazo).toLocaleDateString("pt-BR");
  };

  // Considera o tempo acumulado mesmo quando a contagem está pausada
  const calcularTempoProgramacao = (card) => {
    if (card.programStartISO) {
      const acc = (card.accProgramMs || 0) + (Date.now() - new Date(card.programStartISO).getTime());
      return (acc / 3600000).toFixed(2);
    }
    if (card.accProgramMs) {
      return (card.accProgramMs / 3600000).toFixed(2);
    }
    if (card.tempoProgramacaoHoras) return card.tempoProgramacaoHoras;
    return "0.00";
  };

  // -------- Renderizar cartão --------
  const renderCard = (card, index) => {
    const isExpanded = expandedCardId === card.id;
    const emAndamento = card.coluna === "programando" || card.coluna === "terceiro";
    const dias = calcularDias(card.entradaISO);

    return (
      <Draggable key={card.id} draggableId={card.id} index={index}>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`rounded-xl shadow-md p-2 mb-2 transition-all duration-300 ease-in-out
              ${card.urgente ? "border-2 border-red-500 bg-red-50" : "bg-white"}
            `}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-lg text-gray-900">{card.os}</span>
                <span className="text-xs text-gray-600 truncate">{card.desenho}</span>
                <span className="text-xs text-gray-400">· {dias}d</span>
              </div>
              <button
                type="button"
                aria-label={isExpanded ? "Recolher cartão" : "Expandir cartão"}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedCardId(isExpanded ? null : card.id);
                }}
                className="p-1 shrink-0"
              >
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                )}
              </button>
            </div>

            {emAndamento && (
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-700">
                  <strong>Programador:</strong> {card.programador || "-"}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    finalizar(card);
                  }}
                  className="px-2 py-0.5 rounded bg-green-600 text-white text-xs"
                >
                  Finalizar
                </button>
              </div>
            )}

            {isExpanded && (
              <div className="mt-2 text-sm text-gray-800 space-y-1">
                <p><strong>Cliente:</strong> {card.cliente}</p>
                <p><strong>Setor:</strong> {card.setor}</p>
                {card.prazo && <p><strong>Prazo:</strong> {formatarPrazo(card.prazo)}</p>}
                {card.materiaPrima && <p><strong>Matéria Prima:</strong> {card.materiaPrima}</p>}
                {emAndamento && (
                  <p><strong>Tempo de Programação:</strong> {calcularTempoProgramacao(card)}h</p>
                )}

                <div className="flex justify-between mt-2">
                  <button
                    className="text-sm text-blue-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditando(card);
                    }}
                  >
                    Editar
                  </button>
                  <button
                    className="text-sm text-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      excluir(card.id);
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Draggable>
    );
  };

  // Se não estiver logado → mostrar login
  if (!user) {
    return <LoginPage onLogin={() => {}} />;
  }

  // ordem das colunas conforme solicitado (A)
  const colunaOrdem = [
    "entrada_torno",
    "entrada_centro",
    "entrada_mandriladora",
    "programando",
    "terceiro",
  ];

  const colunaTitulos = {
    entrada_torno: "Entrada - Torno CNC",
    entrada_centro: "Entrada - Centro de Usinagem",
    entrada_mandriladora: "Entrada - Mandriladora",
    programando: "Programando",
    terceiro: "Terceiro",
  };

  return (
    <div className="p-4">
      {/* BLOCO FIXO DO TOPO */}
      <div className="sticky top-0 z-50 bg-white pb-4">
        {/* Header com botão sair */}
        <header className="flex justify-between items-center mb-4 bg-gray-800 text-white p-3 rounded-xl">
          <h1 className="text-2xl font-bold">Kanban Programação</h1>
          <div className="flex items-center gap-4">
            <span>{user.email}</span>
            <button
              onClick={logoutUser}
              className="bg-red-500 px-3 py-1 rounded hover:bg-red-600"
            >
              Sair
            </button>
          </div>
        </header>

        {/* Formulário */}
        <div className="mb-3 grid grid-cols-7 gap-4">
          <input placeholder="OS" value={form.os} onChange={(e) => setForm({ ...form, os: e.target.value })} className="border p-2 rounded" />
          <input placeholder="Desenho" value={form.desenho} onChange={(e) => setForm({ ...form, desenho: e.target.value })} className="border p-2 rounded" />
          <input placeholder="Cliente" value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} className="border p-2 rounded" />

          {/* seleção múltipla de setores */}
          <div className="col-span-1 border p-2 rounded flex flex-col">
            {setores.map((s) => (
              <label key={s} className="text-sm">
                <input
                  type="checkbox"
                  checked={form.setores.includes(s)}
                  onChange={() => {
                    if (form.setores.includes(s)) setForm({ ...form, setores: form.setores.filter((x) => x !== s) });
                    else setForm({ ...form, setores: [...form.setores, s] });
                  }}
                  className="mr-2"
                />
                {s}
              </label>
            ))}
          </div>

          <input type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} className="border p-2 rounded" />

          <input placeholder="Dimensões da Matéria Prima" value={form.materiaPrima} onChange={(e) => setForm({ ...form, materiaPrima: e.target.value })} className="border p-2 rounded" />

          <label className="flex items-center">
            <input type="checkbox" checked={form.urgente} onChange={(e) => setForm({ ...form, urgente: e.target.checked })} className="mr-2" />
            Urgente
          </label>
        </div>

        <div className="flex justify-between items-center mt-2">
          <button
            onClick={addCard}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            Adicionar OS
          </button>

          <button
            onClick={() => window.open("/finalizados", "_blank")}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Visualizar Finalizados
          </button>
        </div>
      </div>

      {/* Colunas Board */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-5 gap-4 mt-6">
          {colunaOrdem.map((col) => (
            <Droppable droppableId={col} key={col}>
              {(provided) => (
                <div className="bg-gray-100 rounded-2xl flex flex-col h-[80vh]">
                  {/* Cabeçalho fixo */}
                  <div className="sticky top-[55rem] z-20 bg-gray-100 pt-3 pb-2">
                    <h2 className="font-bold capitalize text-center">
                      {colunaTitulos[col]}
                      {ENTRADAS.includes(col) && ` (${columns[col].length})`}
                    </h2>
                  </div>

                  {/* Conteúdo rolável */}
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex-1 overflow-y-auto p-3"
                  >
                    {columns[col].map((c, i) => renderCard(c, i))}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      {/* Modal editar */}
      {editando && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center">
          <div className="bg-white p-6 rounded-2xl shadow-lg w-96">
            <h3 className="font-bold mb-3">Editar OS</h3>
            <input value={editando.os} onChange={(e) => setEditando({ ...editando, os: e.target.value })} className="border p-2 rounded w-full mb-2" />
            <input value={editando.desenho} onChange={(e) => setEditando({ ...editando, desenho: e.target.value })} className="border p-2 rounded w-full mb-2" />
            <input value={editando.cliente} onChange={(e) => setEditando({ ...editando, cliente: e.target.value })} className="border p-2 rounded w-full mb-2" />
            <select value={editando.setor} onChange={(e) => setEditando({ ...editando, setor: e.target.value })} className="border p-2 rounded w-full mb-2">
              {setores.map((s) => <option key={s}>{s}</option>)}
            </select>
            <input type="date" value={editando.prazo} onChange={(e) => setEditando({ ...editando, prazo: e.target.value })} className="border p-2 rounded w-full mb-2" />
            <input placeholder="Dimensões da Matéria Prima" value={editando.materiaPrima || ""} onChange={(e) => setEditando({ ...editando, materiaPrima: e.target.value })} className="border p-2 rounded w-full mb-2" />
            <label className="flex items-center mb-2">
              <input type="checkbox" checked={!!editando.urgente} onChange={(e) => setEditando({ ...editando, urgente: e.target.checked })} className="mr-2" />
              Urgente
            </label>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setEditando(null)} className="px-4 py-2 rounded bg-gray-400 text-white">Cancelar</button>
              <button onClick={saveEdit} className="px-4 py-2 rounded bg-blue-600 text-white">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
