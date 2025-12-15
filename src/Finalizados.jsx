import React, { useEffect, useMemo, useState } from "react";
import { db } from "./firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import * as XLSX from "xlsx";

const COLUNAS = [
  { key: "os", label: "OS" },
  { key: "desenho", label: "Desenho" },
  { key: "cliente", label: "Cliente" },
  { key: "setor", label: "Setor" },
  { key: "prazo", label: "Prazo" },
  { key: "programador", label: "Programador" },
  { key: "tempoProgramacaoHoras", label: "Tempo (h)" },
  { key: "fimISO", label: "Fim" },
];

function Finalizados() {
  const [todos, setTodos] = useState([]);
  const [dados, setDados] = useState([]);

  // Datas
  const [inicioInput, setInicioInput] = useState("");
  const [fimInput, setFimInput] = useState("");
  const [gerou, setGerou] = useState(false);

  // Filtros por coluna
  const [filtros, setFiltros] = useState({});

  // Ordenação
  const [ordenacao, setOrdenacao] = useState({
    coluna: "",
    direcao: "asc",
  });

  // ---------- Buscar finalizados ----------
  useEffect(() => {
    const q = query(
      collection(db, "cards"),
      where("coluna", "==", "finalizado")
    );

    const unsub = onSnapshot(q, (snap) => {
      setTodos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => unsub();
  }, []);

  // ---------- Gerar tabela ----------
  const gerarTabela = () => {
    const inicio = new Date(inicioInput);
    const fim = new Date(fimInput + "T23:59:59");

    const filtrados = todos.filter((c) => {
      if (!c.fimISO) return false;
      const d = new Date(c.fimISO);
      return d >= inicio && d <= fim;
    });

    setDados(filtrados);
    setGerou(true);
  };

  // ---------- Presets ----------
  const presetHoje = () => {
    const hoje = new Date().toISOString().slice(0, 10);
    setInicioInput(hoje);
    setFimInput(hoje);
  };

  const presetSemana = () => {
    const hoje = new Date();
    const inicio = new Date();
    inicio.setDate(hoje.getDate() - 6);

    setInicioInput(inicio.toISOString().slice(0, 10));
    setFimInput(hoje.toISOString().slice(0, 10));
  };

  const presetMes = () => {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

    setInicioInput(inicio.toISOString().slice(0, 10));
    setFimInput(hoje.toISOString().slice(0, 10));
  };

  // ---------- Processamento (Filtro + Ordenação) ----------
  const dadosProcessados = useMemo(() => {
    let resultado = [...dados];

    // Filtro por coluna
    resultado = resultado.filter((row) =>
      Object.entries(filtros).every(([key, valor]) => {
        if (!valor) return true;
        return String(row[key] ?? "")
          .toLowerCase()
          .includes(valor.toLowerCase());
      })
    );

    // Ordenação
    if (ordenacao.coluna) {
      resultado.sort((a, b) => {
        const v1 = a[ordenacao.coluna];
        const v2 = b[ordenacao.coluna];

        if (!v1) return 1;
        if (!v2) return -1;

        if (ordenacao.coluna === "fimISO" || ordenacao.coluna === "prazo") {
          return ordenacao.direcao === "asc"
            ? new Date(v1) - new Date(v2)
            : new Date(v2) - new Date(v1);
        }

        return ordenacao.direcao === "asc"
          ? String(v1).localeCompare(String(v2))
          : String(v2).localeCompare(String(v1));
      });
    }

    return resultado;
  }, [dados, filtros, ordenacao]);

  // ---------- EXPORTAR EXCEL ----------
  const exportarExcel = () => {
    const linhas = dadosProcessados.map((c) => ({
      OS: c.os,
      Desenho: c.desenho,
      Cliente: c.cliente,
      Setor: c.setor,
      Prazo: c.prazo
        ? new Date(c.prazo).toLocaleDateString("pt-BR")
        : "",
      Programador: c.programador,
      "Tempo (h)": c.tempoProgramacaoHoras,
      Fim: c.fimISO
        ? new Date(c.fimISO).toLocaleString("pt-BR")
        : "",
    }));

    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Finalizados");

    XLSX.writeFile(
      wb,
      `finalizados_${inicioInput}_a_${fimInput}.xlsx`
    );
  };

  const datasValidas =
    inicioInput &&
    fimInput &&
    new Date(inicioInput) <= new Date(fimInput);

  const toggleOrdenacao = (coluna) => {
    setOrdenacao((prev) => ({
      coluna,
      direcao:
        prev.coluna === coluna && prev.direcao === "asc"
          ? "desc"
          : "asc",
    }));
  };

  const formatarData = (d) =>
    d ? new Date(d).toLocaleDateString("pt-BR") : "";

  // ---------- Render ----------
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Finalizados</h1>

      {/* Datas + Presets */}
      <div className="flex flex-wrap gap-4 items-end mb-4">
        <input
          type="date"
          value={inicioInput}
          onChange={(e) => setInicioInput(e.target.value)}
          className="border p-2 rounded"
        />

        <input
          type="date"
          value={fimInput}
          onChange={(e) => setFimInput(e.target.value)}
          className="border p-2 rounded"
        />

        <button
          onClick={gerarTabela}
          disabled={!datasValidas}
          className={`px-4 py-2 rounded text-white ${
            datasValidas
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-gray-400 cursor-not-allowed"
          }`}
        >
          Gerar tabela
        </button>

        <button
          onClick={exportarExcel}
          disabled={!gerou || dadosProcessados.length === 0}
          className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-400"
        >
          Exportar Excel
        </button>

        <div className="flex gap-2">
          <button onClick={presetHoje} className="px-3 py-2 border rounded">
            Hoje
          </button>
          <button onClick={presetSemana} className="px-3 py-2 border rounded">
            Últimos 7 dias
          </button>
          <button onClick={presetMes} className="px-3 py-2 border rounded">
            Mês atual
          </button>
        </div>
      </div>

      {!gerou && (
        <p className="text-gray-600">
          Selecione um período e clique em <strong>Gerar tabela</strong>.
        </p>
      )}

      {gerou && (
        <div className="overflow-auto">
          <table className="w-full border border-gray-300">
            <thead className="bg-gray-200">
              <tr>
                {COLUNAS.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => toggleOrdenacao(c.key)}
                    className="border px-2 py-1 cursor-pointer select-none"
                  >
                    {c.label}
                    {ordenacao.coluna === c.key &&
                      (ordenacao.direcao === "asc" ? " 🔼" : " 🔽")}
                  </th>
                ))}
              </tr>

              <tr>
                {COLUNAS.map((c) => (
                  <th key={c.key} className="border px-1 py-1">
                    <input
                      type="text"
                      value={filtros[c.key] || ""}
                      onChange={(e) =>
                        setFiltros({
                          ...filtros,
                          [c.key]: e.target.value,
                        })
                      }
                      className="w-full border px-1 text-sm"
                      placeholder="Filtrar"
                    />
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {dadosProcessados.length === 0 && (
                <tr>
                  <td colSpan={COLUNAS.length} className="text-center p-4">
                    Nenhum registro encontrado
                  </td>
                </tr>
              )}

              {dadosProcessados.map((c) => (
                <tr key={c.id} className="text-center">
                  <td className="border px-2 py-1">{c.os}</td>
                  <td className="border px-2 py-1">{c.desenho}</td>
                  <td className="border px-2 py-1">{c.cliente}</td>
                  <td className="border px-2 py-1">{c.setor}</td>
                  <td className="border px-2 py-1">
                    {formatarData(c.prazo)}
                  </td>
                  <td className="border px-2 py-1">{c.programador}</td>
                  <td className="border px-2 py-1">
                    {c.tempoProgramacaoHoras}h
                  </td>
                  <td className="border px-2 py-1">
                    {formatarData(c.fimISO)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Finalizados;
