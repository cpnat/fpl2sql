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
            fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Source Code Pro', monospace",
            backgroundColor: '#ffffff',
          },
          '.cm-scroller': {
            maxHeight: '500px',
            fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Source Code Pro', monospace",
          },
          '.cm-content': {
            padding: '12px',
            minHeight: '120px',
          },
          '.cm-focused': {
            outline: 'none',
          },
          '.cm-editor': {
            borderRadius: '8px',
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

function showLoadingSkeleton() {
  const loadingBar = document.getElementById('loadingBar');
  if (loadingBar) {
    loadingBar.innerHTML = `
      <div class="loading-container fade-in">
        <div class="loading-spinner"></div>
        <div class="loading-text">Loading database...</div>
      </div>
    `;
  }
}

function showErrorMessage(error: unknown) {
  const container = document.getElementById('result') as HTMLElement;
  const errorMessage = error instanceof Error ? error.message : String(error);

  container.innerHTML = `
    <div class="error-message slide-in">
      <span class="error-icon">✕</span>
      <div class="error-content">
        <div class="error-title">Query Execution Failed</div>
        <div>${escapeHtml(errorMessage)}</div>
        <div class="error-details">${escapeHtml(errorMessage)}</div>
      </div>
    </div>
  `;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


async function init() {
  console.log('Initializing DuckDB');
  const conn = await setupDatabase();
  const baseURL = new URL('./db_export', STORAGE_URL).href;

  console.log('Loading database files');
  showLoadingSkeleton();

  try {
    await loadDatabaseFiles(conn, baseURL);
    await introspectDatabase(conn);
    document.getElementById('loadingBar')!.innerHTML = '';

    const schemaDiv = document.getElementById('databaseSchema');
    if (schemaDiv) {
      schemaDiv.classList.add('fade-in');
    }
  } catch (error) {
    console.error('Error loading database:', error);
    document.getElementById('loadingBar')!.innerHTML = `
      <div class="error-message slide-in">
        <span class="error-icon">✕</span>
        <div class="error-content">
          <div class="error-title">Failed to load database</div>
          <div>${error instanceof Error ? error.message : String(error)}</div>
        </div>
      </div>
    `;
  }

  const queryEditor = setupEditor();

  // Add event listeners for accordion to highlight active cards
  const accordionCards = document.querySelectorAll('#accordion .clickable-card');
  accordionCards.forEach((card) => {
    const collapse = card.querySelector('.collapse');
    if (collapse) {
      // Bootstrap 4 events
      collapse.addEventListener('shown.bs.collapse', () => {
        card.classList.add('show');
      });
      collapse.addEventListener('hidden.bs.collapse', () => {
        card.classList.remove('show');
      });
      // Don't mark as shown on initial load - only when user interacts
    }

    // Prevent card click when clicking on links inside
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'A' || target.closest('a')) {
        e.stopPropagation();
        return;
      }
    });
  });

  document.getElementById('submit')?.addEventListener('click', () => submitQuery(conn, queryEditor));

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
  const query = getQuery(queryEditor);

  if (!query.trim()) {
    showErrorMessage(new Error('Please enter a SQL query'));
    return;
  }

  const submitButton = document.getElementById('submit') as HTMLButtonElement;
  const container = document.getElementById('result') as HTMLElement;
  const pagesDiv = document.getElementById('pages') as HTMLElement;

  // Show loading state
  submitButton.disabled = true;
  submitButton.classList.add('loading');
  pagesDiv.innerHTML = '';
  container.innerHTML = `
    <div class="loading-container fade-in">
      <div class="loading-spinner"></div>
      <div class="loading-text">Executing query...</div>
    </div>
  `;

  try {
    const res = await conn.query(query);

    DATA = JSON.parse(
      JSON.stringify(res.toArray(), (key, value) => (typeof value === 'bigint' ? Number(value) : value))
    );

    if (DATA.length === 0) {
      container.innerHTML = `
        <div class="info-message fade-in">
          <span>ℹ</span>
          <span>Query executed successfully but returned no results.</span>
        </div>
      `;
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      container.innerHTML = '';
      container.classList.add('fade-in');

      const columnKeys = Object.keys(DATA[0]);
      const hot = new Handsontable(container, {
        data: DATA.slice(0, ROWS_ON_SINGLE_PAGE),
        readOnly: true,
        rowHeaders: range(1, Math.min(ROWS_ON_SINGLE_PAGE, DATA.length)),
        colHeaders: columnKeys,
        columns: columnKeys.map((key) => ({
          data: key,
          type: 'text',
        })),
        height: 'auto',
        autoWrapRow: false,
        autoWrapCol: false,
        wordWrap: false,
        dropdownMenu: false,
        multiColumnSorting: true,
        filters: false,
        licenseKey: 'non-commercial-and-evaluation',
      });

      createPages(hot);
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (error) {
    showErrorMessage(error);
    console.error('Error executing query:', error);
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } finally {
    submitButton.disabled = false;
    submitButton.classList.remove('loading');
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
  queryEditor.focus();

  // Scroll the query editor into view
  const queryEditorElement = document.getElementById('queryEditor');
  if (queryEditorElement) {
    queryEditorElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
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
  const root = document.documentElement;
  const bgColor = getComputedStyle(root).getPropertyValue('--bg-color').trim();
  const primaryColor = getComputedStyle(root).getPropertyValue('--primary-color').trim();

  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i] as HTMLElement;
    button.style.backgroundColor = bgColor;
    button.style.color = primaryColor;
    button.style.borderColor = primaryColor;
  }
  const selectedButton = buttons[pageNumber - 1] as HTMLElement;
  if (selectedButton) {
    selectedButton.style.backgroundColor = primaryColor;
    selectedButton.style.color = bgColor;
    selectedButton.style.borderColor = primaryColor;
  }
}

function createPages(hot: Handsontable) {
  const pages = document.getElementById('pages') as HTMLElement;
  pages.innerHTML = '';

  const els = Math.ceil(DATA.length / ROWS_ON_SINGLE_PAGE);

  if (els <= 1) {
    pages.innerHTML = `<span class="result-count">${DATA.length} result${DATA.length !== 1 ? 's' : ''}</span>`;
    return;
  }

  // Add result count
  const countSpan = document.createElement('span');
  countSpan.className = 'result-count';
  countSpan.textContent = `${DATA.length} result${DATA.length !== 1 ? 's' : ''}`;
  pages.appendChild(countSpan);

  for (let i = 0; i < els; i++) {
    const bt = document.createElement('BUTTON');
    bt.className = 'myBt fade-in';
    bt.style.animationDelay = `${i * 0.05}s`;
    bt.innerHTML = (i + 1).toString();
    pages.appendChild(bt);
  }

  setPageStyles(1);

  pages.addEventListener('click', function (e) {
    const target = e.target as HTMLElement;
    if (target.classList.contains('myBt')) {
      const clicked = target.innerHTML;
      setPageStyles(Number(clicked));
      const startIdx = (Number(clicked) - 1) * ROWS_ON_SINGLE_PAGE;
      const endIdx = Number(clicked) * ROWS_ON_SINGLE_PAGE;
      const newData = DATA.slice(startIdx, endIdx);
      const newRows = range(startIdx + 1, Math.min(endIdx, DATA.length));
      hot.loadData(newData);
      hot.updateSettings({
        rowHeaders: newRows,
      });
    }
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
