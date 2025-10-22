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

function App() {
  const setores = ["Centro de Usiangem", "Torno CNC", "Mandriladora"];

  const [user, setUser] = useState(null); // controla usuário logado
  const [columns, setColumns] = useState({
    entrada: [],
    programando: [],
    terceiro: [],
    saida: [],
  });
  const [finalizados, setFinalizados] = useState([]);
  const [form, setForm] = useState({
    os: "",
    desenho: "",
    cliente: "",
    setor: setores[0],
    prazo: "",
    urgente: false,
  });
  const [editando, setEditando] = useState(null);
  const [filtrosSetores, setFiltrosSetores] = useState([...setores]);
  const [expandedCardId, setExpandedCardId] = useState(null);
  const [lockedCardId, setLockedCardId] = useState(null);

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

      // Entrada ordenada por urgência + prazo
      const entradaCards = cards
        .filter((c) => c.coluna === "entrada")
        .sort((a, b) => {
          if (a.urgente && !b.urgente) return -1;
          if (!a.urgente && b.urgente) return 1;
          if (a.prazo && b.prazo) return new Date(a.prazo) - new Date(b.prazo);
          return 0;
        });

      setColumns({
        entrada: entradaCards,
        programando: cards.filter((c) => c.coluna === "programando"),
        terceiro: cards.filter((c) => c.coluna === "terceiro"),
        saida: cards.filter((c) => c.coluna === "saida"),
      });

      setFinalizados(cards.filter((c) => c.coluna === "finalizado"));
    });
    return () => unsub();
  }, [user]);

  // -------- Criar cartão --------
  const addCard = async () => {
    if (!form.os.trim()) {
      alert("Informe a OS (campo obrigatório).");
      return;
    }

    const id = crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString();
    const nowISO = new Date().toISOString();

    const card = {
      id,
      os: form.os.trim(),
      desenho: form.desenho.trim(),
      cliente: form.cliente.trim(),
      setor: form.setor,
      prazo: form.prazo || "",
      urgente: !!form.urgente,
      programador: "",
      programStartISO: null,
      accProgramMs: 0,
      programEndISO: null,
      tempoProgramacaoHoras: null,
      entradaISO: nowISO,
      fimISO: null,
      coluna: "entrada",
    };

    try {
      await setDoc(doc(collection(db, "cards"), card.id), card);
      setForm({
        os: "",
        desenho: "",
        cliente: "",
        setor: setores[0],
        prazo: "",
        urgente: false,
      });
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
    await setDoc(
      doc(db, "cards", card.id),
      { coluna: "finalizado", fimISO },
      { merge: true }
    );
  };

  // ---------- Drag & Drop ----------
  const onDragEnd = async (result) => {
    const { source, destination } = result;
    if (!destination) return;

    const fromKey = source.droppableId;
    const toKey = destination.droppableId;

    if (fromKey === toKey) {
      const list = Array.from(columns[fromKey]);
      const [moved] = list.splice(source.index, 1);
      list.splice(destination.index, 0, moved);
      setColumns({ ...columns, [fromKey]: list });
      await setDoc(doc(db, "cards", moved.id), { coluna: toKey }, { merge: true });
      return;
    }

    const currentCols = columns;
    const listFrom = Array.from(currentCols[fromKey]);
    const listTo = Array.from(currentCols[toKey]);

    const moved = { ...listFrom[source.index] };
    if (!moved) return;

    if (toKey === "programando" || toKey === "terceiro") {
      const resp = window.prompt(
        "Digite o nome do programador:",
        moved.programador || ""
      );
      if (!resp || !resp.trim()) return;
      moved.programador = resp.trim();
    }

    if (toKey === "saida" && !moved.programador) {
      alert("Defina o programador antes de enviar para Saída.");
      return;
    }

    listFrom.splice(source.index, 1);
    const now = Date.now();

    if ((fromKey === "programando" || fromKey === "terceiro") && moved.programStartISO) {
      const startMs = new Date(moved.programStartISO).getTime();
      if (!isNaN(startMs)) {
        moved.accProgramMs = (moved.accProgramMs || 0) + (now - startMs);
      }
      moved.programStartISO = null;
    }

    if (toKey === "programando" || toKey === "terceiro") {
      if (!moved.programStartISO) moved.programStartISO = new Date(now).toISOString();
    }

    if (toKey === "saida") {
      if (moved.programStartISO) {
        const startMs = new Date(moved.programStartISO).getTime();
        if (!isNaN(startMs)) {
          moved.accProgramMs = (moved.accProgramMs || 0) + (now - startMs);
        }
        moved.programStartISO = null;
      }
      moved.programEndISO = new Date(now).toISOString();
      moved.tempoProgramacaoHoras = moved.accProgramMs
        ? (moved.accProgramMs / 3600000).toFixed(2)
        : "0.00";
    }

    moved.coluna = toKey;
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

  const calcularTempoProgramacao = (card) => {
    if (card.tempoProgramacaoHoras) return card.tempoProgramacaoHoras;
    if (card.programStartISO && card.programEndISO) {
      const diff = new Date(card.programEndISO) - new Date(card.programStartISO);
      return (diff / 3600000).toFixed(2);
    }
    return "-";
  };

  // -------- Renderizar cartão --------
  const renderCard = (card, index) => {
    const isHovered = expandedCardId === card.id;
    const isLocked = lockedCardId === card.id;
    const isExpanded = isHovered || isLocked;

    return (
      <Draggable key={card.id} draggableId={card.id} index={index}>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            onMouseEnter={() => !isLocked && setExpandedCardId(card.id)}
            onMouseLeave={() => !isLocked && setExpandedCardId(null)}
            onClick={() => setLockedCardId(isLocked ? null : card.id)}
            className={`rounded-xl shadow-md p-2 mb-2 cursor-pointer transition-all duration-300 ease-in-out
              ${card.urgente ? "border-2 border-red-500 bg-red-50" : "bg-white"}
              ${isExpanded ? "max-h-96" : "max-h-14 overflow-hidden"}
            `}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-gray-900">{card.os}</span>
                <span className="text-xs text-gray-600 truncate">{card.desenho}</span>
              </div>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </div>

            {isExpanded && (
              <div className="mt-2 text-sm text-gray-800 space-y-1">
                <p><strong>Cliente:</strong> {card.cliente}</p>
                <p><strong>Setor:</strong> {card.setor}</p>
                {card.prazo && <p><strong>Prazo:</strong> {formatarPrazo(card.prazo)}</p>}
                {card.programador && <p><strong>Programador:</strong> {card.programador}</p>}

                {card.coluna === "saida" && (
                  <>
                    <p><strong>Tempo de Programação:</strong> {calcularTempoProgramacao(card)}h</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        finalizar(card);
                      }}
                      className="mt-2 px-3 py-1 rounded bg-green-600 text-white text-sm"
                    >
                      Finalizar
                    </button>
                  </>
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

  return (
    <div className="p-4">
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
      <div className="mb-3 grid grid-cols-6 gap-4">
        <input placeholder="OS" value={form.os} onChange={(e) => setForm({ ...form, os: e.target.value })} className="border p-2 rounded" />
        <input placeholder="Desenho" value={form.desenho} onChange={(e) => setForm({ ...form, desenho: e.target.value })} className="border p-2 rounded" />
        <input placeholder="Cliente" value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} className="border p-2 rounded" />
        <select value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })} className="border p-2 rounded">
          {setores.map((s) => <option key={s}>{s}</option>)}
        </select>
        <input type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} className="border p-2 rounded" />
        <label className="flex items-center">
          <input type="checkbox" checked={form.urgente} onChange={(e) => setForm({ ...form, urgente: e.target.checked })} className="mr-2" />
          Urgente
        </label>
      </div>
      <button onClick={addCard} className="bg-green-500 text-white px-4 py-2 rounded">Adicionar OS</button>

      {/* Filtros por setores */}
      <div className="flex gap-2 mt-3 mb-3 flex-wrap">
        {setores.map((s) => {
          const ativo = filtrosSetores.includes(s);
          return (
            <button
              key={s}
              onClick={() => {
                if (ativo) setFiltrosSetores(filtrosSetores.filter(f => f !== s));
                else setFiltrosSetores([...filtrosSetores, s]);
              }}
              className={`px-3 py-1 rounded text-white transition-colors duration-200
                ${ativo ? "bg-blue-800" : "bg-gray-500"}`}
            >
              {s}
            </button>
          );
        })}
      </div>

      {/* Board */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-4 gap-4 mt-6">
          {Object.keys(columns).map((col) => (
            <Droppable droppableId={col} key={col}>
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="bg-gray-100 rounded-2xl p-3 min-h-[300px]">
                  <h2 className="font-bold capitalize mb-2">{col}</h2>
                  {columns[col]
                    .filter(c => filtrosSetores.includes(c.setor))
                    .map((c, i) => renderCard(c, i))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      {/* Finalizados */}
      <div className="mt-8">
        <h2 className="text-xl font-bold mb-2">Finalizados</h2>
        <table className="w-full border border-gray-300">
          <thead className="bg-gray-200">
            <tr>
              <th className="border px-2 py-1">OS</th>
              <th className="border px-2 py-1">Desenho</th>
              <th className="border px-2 py-1">Cliente</th>
              <th className="border px-2 py-1">Setor</th>
              <th className="border px-2 py-1">Prazo</th>
              <th className="border px-2 py-1">Programador</th>
              <th className="border px-2 py-1">Tempo</th>
              <th className="border px-2 py-1">Fim</th>
            </tr>
          </thead>
          <tbody>
            {finalizados
              .filter(c => filtrosSetores.includes(c.setor))
              .map((card) => (
                <tr key={card.id} className="text-center">
                  <td className="border px-2 py-1">{card.os}</td>
                  <td className="border px-2 py-1">{card.desenho}</td>
                  <td className="border px-2 py-1">{card.cliente}</td>
                  <td className="border px-2 py-1">{card.setor}</td>
                  <td className="border px-2 py-1">{formatarPrazo(card.prazo)}</td>
                  <td className="border px-2 py-1">{card.programador}</td>
                  <td className="border px-2 py-1">{calcularTempoProgramacao(card)}h</td>
                  <td className="border px-2 py-1">{card.fimISO ? new Date(card.fimISO).toLocaleString("pt-BR") : "-"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

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
