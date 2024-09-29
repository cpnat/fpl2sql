import './style.css';
import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_next from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import Handsontable from 'handsontable';
import { basicSetup } from 'codemirror';
import 'handsontable/dist/handsontable.full.min.css';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { sql } from '@codemirror/lang-sql';
import jsonview from '@pgrabovets/json-view';
import {
  playerResultsQueryString,
  fixturesQueryString,
  playerStatsQueryString,
  playerStatsShabangQueryString,
  resultsQueryString,
} from './queries';

const STORAGE_URL = 'https://storage.fpl2sql.com';

interface DuckDBBundle {
  mainModule: string;
  mainWorker: string;
}

const MANUAL_BUNDLES: Record<string, DuckDBBundle> = {
  mvp: {
    mainModule: duckdb_wasm,
    mainWorker: mvp_worker,
  },
  eh: {
    mainModule: duckdb_wasm_next,
    mainWorker: eh_worker,
  },
};

const ROWS_ON_SINGLE_PAGE = 50;
let DATA: Record<string, unknown>[] = [];

async function setupDatabase() {
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  const worker = new Worker(bundle.mainWorker);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const conn = await db.connect();
  return conn;
}

async function loadFileToDatabase(conn: duckdb.AsyncConnection, fileURL: string, baseURL: string) {
  console.log(`Loading file from: ${fileURL}`);
  const fileReader = new FileReader();

  try {
    const response = await fetch(fileURL);
    const fileContent = await response.text();

    fileReader.onload = function (e: ProgressEvent<FileReader>) {
      const content = (e.target?.result as string).replace(/db_export/g, baseURL);
      conn.query(content);
    };

    fileReader.readAsText(new Blob([fileContent]));
  } catch (error) {
    console.error(`Error loading file from ${fileURL}:`, error);
  }
}

async function loadDatabaseFiles(conn: duckdb.AsyncConnection, baseURL: string) {
  const dbSchemaUrl = new URL(baseURL + '/schema.sql');
  const dbDataUrl = new URL(baseURL + '/load.sql');

  await loadFileToDatabase(conn, dbSchemaUrl.href, baseURL);
  await loadFileToDatabase(conn, dbDataUrl.href, baseURL);
}

function setupEditor(): EditorView {
  const queryTextArea = document.getElementById('queryEditor') as HTMLElement;
  queryTextArea.innerHTML = '';

  const queryEditor = new EditorView({
    state: EditorState.create({
      doc: queryTextArea.textContent || '',
      extensions: [
        basicSetup,
        sql(),
        EditorView.theme({
          '&': {
            height: 'auto',
            overflow: 'hidden',
            fontSize: '14px',
            fontFamily: 'Avenir, Helvetica, Arial, sans-serif',
          },
          '.cm-scroller': {
            maxHeight: '500px',
          },
        }),
      ],
    }),
    parent: queryTextArea,
  });

  queryEditor.focus();
  return queryEditor;
}

async function introspectDatabase(conn: duckdb.AsyncConnection) {
  const schemaMap: Record<string, Record<string, string>> = {};

  console.log('Introspecting database schema');

  const schemaRes = await conn.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    ORDER BY table_name, ordinal_position;
  `);

  const rows = schemaRes.toArray();

  rows.forEach((row) => {
    const { table_name, column_name, data_type } = row;

    if (!schemaMap[table_name]) {
      schemaMap[table_name] = {};
    }

    schemaMap[table_name][column_name] = data_type;
  });

  const schemaDiv = document.getElementById('databaseSchema') as HTMLElement;

  const tree = jsonview.create(schemaMap);
  jsonview.render(tree, schemaDiv);

  const jsonKeyElement = schemaDiv.querySelector('.json-container .json-key') as HTMLElement;
  if (jsonKeyElement) {
    jsonKeyElement.textContent = 'Tables';
  }

  jsonview.expand(tree);
  for (let i = 0; i < tree.children.length; i++) {
    jsonview.collapse(tree.children[i]);
  }
}

async function init() {
  console.log('Initializing DuckDB');
  const conn = await setupDatabase();
  const baseURL = new URL('./db_export', STORAGE_URL).href;

  console.log('Loading database files');
  const loading = `
  <div class="d-flex justify-content-center">
    <div class="spinner-border" role="status">
      <span class="sr-only"></span>
    </div>
  </div>`;
  document.getElementById('loadingBar')!.innerHTML = loading;
  await loadDatabaseFiles(conn, baseURL);

  await introspectDatabase(conn);
  const queryEditor = setupEditor();

  document.getElementById('submit')?.addEventListener('click', () => submitQuery(conn, queryEditor));
  document.getElementById('loadingBar')!.innerHTML = '';

  document.getElementById('teamFixturesQuery')?.addEventListener('click', () => fixturesQuery(queryEditor));
  document.getElementById('teamResultsQuery')?.addEventListener('click', () => resultsQuery(queryEditor));
  document.getElementById('playerResultsQuery')?.addEventListener('click', () => playerResultsQuery(queryEditor));
  document.getElementById('playerStatsQuery')?.addEventListener('click', () => playerStatsQuery(queryEditor));
  document
    .getElementById('playerStatsShabangQuery')
    ?.addEventListener('click', () => playerStatsShabangQuery(queryEditor));
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function getQuery(queryEditor: EditorView): string {
  console.log('Query:', queryEditor.state.doc.toString());
  return queryEditor.state.doc.toString();
}

async function submitQuery(conn: duckdb.AsyncConnection, queryEditor: EditorView) {
  document.getElementById('pages')!.innerHTML = 'Executing query...';
  const query = getQuery(queryEditor);

  const container = document.getElementById('result') as HTMLElement;
  container.innerHTML = '';

  try {
    const res = await conn.query(query);

    DATA = JSON.parse(
      JSON.stringify(res.toArray(), (key, value) => (typeof value === 'bigint' ? Number(value) : value))
    );

    const hot = new Handsontable(container, {
      data: DATA.slice(0, ROWS_ON_SINGLE_PAGE),
      readOnly: true,
      rowHeaders: range(1, ROWS_ON_SINGLE_PAGE),
      colHeaders: Object.keys(DATA[0]),
      height: 'auto',
      autoWrapRow: true,
      autoWrapCol: true,
      dropdownMenu: false,
      multiColumnSorting: true,
      filters: false,
      licenseKey: 'non-commercial-and-evaluation',
    });

    createPages(hot);
  } catch (error) {
    document.getElementById('pages')!.innerHTML = '';
    container.innerHTML = 'Error executing query: ' + error;
    console.error('Error executing query:', error);
  }
}

function insertQuery(queryEditor: EditorView, query: string) {
  queryEditor.dispatch({
    changes: {
      from: 0,
      to: queryEditor.state.doc.length,
      insert: query,
    },
  });
}

function playerResultsQuery(queryEditor: EditorView) {
  insertQuery(queryEditor, playerResultsQueryString);
}

function fixturesQuery(queryEditor: EditorView) {
  insertQuery(queryEditor, fixturesQueryString);
}

function resultsQuery(queryEditor: EditorView) {
  insertQuery(queryEditor, resultsQueryString);
}

function playerStatsQuery(queryEditor: EditorView) {
  insertQuery(queryEditor, playerStatsQueryString);
}

function playerStatsShabangQuery(queryEditor: EditorView) {
  insertQuery(queryEditor, playerStatsShabangQueryString);
}

function setPageStyles(pageNumber: number) {
  const buttons = document.getElementsByClassName('myBt');
  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i] as HTMLElement;
    button.style.backgroundColor = 'white';
    button.style.color = 'green';
  }
  const selectedButton = buttons[pageNumber - 1] as HTMLElement;
  selectedButton.style.backgroundColor = 'green';
  selectedButton.style.color = 'white';
}

function createPages(hot: Handsontable) {
  const pages = document.getElementById('pages') as HTMLElement;
  pages.innerHTML = '';

  const els = Math.ceil(DATA.length / ROWS_ON_SINGLE_PAGE);

  for (let i = 0; i < els; i++) {
    const bt = document.createElement('BUTTON');
    bt.className = 'myBt';
    bt.innerHTML = (i + 1).toString();
    pages.appendChild(bt);
  }

  setPageStyles(1);

  pages.addEventListener('click', function (e) {
    const clicked = (e.target as HTMLElement).innerHTML;
    setPageStyles(Number(clicked));
    const newData = DATA.slice((Number(clicked) - 1) * ROWS_ON_SINGLE_PAGE, Number(clicked) * ROWS_ON_SINGLE_PAGE);
    const newRows = range((Number(clicked) - 1) * ROWS_ON_SINGLE_PAGE + 1, Number(clicked) * ROWS_ON_SINGLE_PAGE);
    hot.loadData(newData);
    hot.updateSettings({
      rowHeaders: newRows,
    });
  });
}

document.addEventListener('DOMContentLoaded', function () {
  checkViewportSize();
});

window.addEventListener('resize', function () {
  checkViewportSize();
});

function checkViewportSize() {
  const viewportWidth = window.innerWidth;

  if (viewportWidth < 1250) {
    // Add any specific logic if needed for smaller viewports
  } else {
    // Add logic for larger viewports
  }
}

(async () => {
  try {
    await init();
  } catch (error) {
    console.error('Error initializing:', error);
  }
})();
