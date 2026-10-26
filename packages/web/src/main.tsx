import model from 'virtual:uio-model';
import { render } from 'preact';
import { App } from './app.tsx';
import { createHost } from './engine-host.ts';
import './styles.css';

const root = document.getElementById('app');
if (root === null) throw new Error('the page has no #app element');
render(<App host={createHost(model)} />, root);
