;// src/App.jsx (ATUALIZADO)
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

function normalizeSetorKey(setor) {
  // cria chaves 'entrada_torno', 'entrada_centro', 'entrada_mandriladora'
  const s = setor.toLowerCase();
  if (s.includes("torno")) return "entrada_torno";
  if (s.includes("centro")) return "entrada_centro";
  if (s.includes("mandril")) return "entrada_mandriladora";
  // fallback
  return `entrada_${s.replace(/\s+/g, "_")}`;
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
  const [finalizados, setFinalizados] = useState([]);
  const [form, setForm] = useState({
    os: "",
    desenho: "",
    cliente: "",
    setores: [], // agora array
    prazo: "",
    urgente: false,
  });
  const [editando, setEditando] = useState(null);
  //const [filtrosSetores, setFiltrosSetores] = useState([...setores]);
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
      const entrada_torno = cards
        .filter((c) => c.coluna === "entrada_torno")
        .sort((a, b) => {
          if (a.urgente && !b.urgente) return -1;
          if (!a.urgente && b.urgente) return 1;
          if (a.prazo && b.prazo) return new Date(a.prazo) - new Date(b.prazo);
          return 0;
        });

      const entrada_centro = cards
        .filter((c) => c.coluna === "entrada_centro")
        .sort((a, b) => {
          if (a.urgente && !b.urgente) return -1;
          if (!a.urgente && b.urgente) return 1;
          if (a.prazo && b.prazo) return new Date(a.prazo) - new Date(b.prazo);
          return 0;
        });

      const entrada_mandriladora = cards
        .filter((c) => c.coluna === "entrada_mandriladora")
        .sort((a, b) => {
          if (a.urgente && !b.urgente) return -1;
          if (!a.urgente && b.urgente) return 1;
          if (a.prazo && b.prazo) return new Date(a.prazo) - new Date(b.prazo);
          return 0;
        });

      setColumns({
        entrada_torno,
        entrada_centro,
        entrada_mandriladora,
        programando: cards.filter((c) => c.coluna === "programando"),
        terceiro: cards.filter((c) => c.coluna === "terceiro"),
      });

      setFinalizados(cards.filter((c) => c.coluna === "finalizado"));
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

      setForm({ os: "", desenho: "", cliente: "", setores: [], prazo: "", urgente: false });
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

      // --- RESTRIÇÃO DE MOVIMENTO ---
      const entradas = ["entrada_torno", "entrada_centro", "entrada_mandriladora"];
      const destinosPermitidos = ["programando", "terceiro"];

      // --- REGRA 1: Bloquear saída das entradas para qualquer coluna não permitida ---
      if (entradas.includes(fromKey) && !destinosPermitidos.includes(toKey)) {
       return;
      }

      // --- REGRA 2: Forçar retorno para a coluna de entrada correta ---
     if (["programando", "terceiro"].includes(fromKey) && entradas.includes(toKey)) {
     const movedCard = columns[fromKey][source.index];
     const colunaCorreta = normalizeSetorKey(movedCard.setor);

     if (toKey !== colunaCorreta) {
       return;  // impede o drop errado
       }
     }

      // Impede saída de entradas para qualquer coisa que não seja permitido
      if (entradas.includes(fromKey) && !destinosPermitidos.includes(toKey)) {
       return;
      }

    // se mesma coluna, apenas reordena
    if (fromKey === toKey) {
      const list = Array.from(columns[fromKey]);
      const [moved] = list.splice(source.index, 1);
      list.splice(destination.index, 0, moved);
      setColumns({ ...columns, [fromKey]: list });
      // opcional: atualizar ordem no Firestore se necessário
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

    // Se movendo para uma entrada (voltar para entrada), fechamos tempo de programação
    const now = Date.now();

    if ((fromKey === "programando" || fromKey === "terceiro") && moved.programStartISO) {
      const startMs = new Date(moved.programStartISO).getTime();
      if (!isNaN(startMs)) {
        moved.accProgramMs = (moved.accProgramMs || 0) + (now - startMs);
      }
      moved.programStartISO = null;
    }

    // Se movendo para programando/terceiro iniciamos contagem
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

  const calcularTempoProgramacao = (card) => {
    if (card.tempoProgramacaoHoras) return card.tempoProgramacaoHoras;
    if (card.programStartISO && card.programEndISO) {
      const diff = new Date(card.programEndISO) - new Date(card.programStartISO);
      return (diff / 3600000).toFixed(2);
    }
    if (card.programStartISO) {
      const acc = (card.accProgramMs || 0) + (Date.now() - new Date(card.programStartISO).getTime());
      return (acc / 3600000).toFixed(2);
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

                {(card.coluna === "programando" || card.coluna === "terceiro") && (
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

        {/* seleção múltipla de setores (checkboxes) */}
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
        <label className="flex items-center">
          <input type="checkbox" checked={form.urgente} onChange={(e) => setForm({ ...form, urgente: e.target.checked })} className="mr-2" />
          Urgente
        </label>
      </div>
      <button onClick={addCard} className="bg-green-500 text-white px-4 py-2 rounded">Adicionar OS</button>



      {/* Board */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-5 gap-4 mt-6">
          {colunaOrdem.map((col) => (
            <Droppable droppableId={col} key={col}>
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="bg-gray-100 rounded-2xl p-3 min-h-[300px]">
                  <h2 className="font-bold capitalize mb-2">{colunaTitulos[col]}</h2>
                  {columns[col].map((c, i) => renderCard(c, i))}
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
            {finalizados.map((card) => (
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


/* ===================================== */
/* src/LoginPage.jsx (ATUALIZADO)        */
/* Substitua o seu LoginPage pelo conteúdo */
/* ===================================== */

// LoginPage.jsx deve ficar em um arquivo separado em src/LoginPage.jsx
// Removi o código daqui para evitar o erro de import React duplicado.
