import { MarkedText } from '../components/conclusion.tsx';
import { useApp, useUi } from '../context.ts';
import { modelText } from '../i18n/text.ts';
import { routeHref } from '../router.ts';

/** WEB-02, D-10: every scheme of the model, sorted by its label in the page language. */
export function SchemesView() {
  const { host, lang } = useApp();
  const ui = useUi();
  const items = Object.entries(host.model.schemes)
    .map(([id, scheme]) => ({ id, label: modelText(scheme.label, lang) }))
    .sort((a, b) => a.label.text.localeCompare(b.label.text, lang) || a.id.localeCompare(b.id));
  return (
    <>
      <h1 tabIndex={-1}>{ui.schemesHeading}</h1>
      <p>{ui.schemesIntro}</p>
      <ul class="scheme-list">
        {items.map((item) => (
          <li key={item.id}>
            <a href={routeHref({ view: 'scheme', id: item.id })}>
              <MarkedText rendered={item.label} />
            </a>{' '}
            <code>{item.id}</code>
          </li>
        ))}
      </ul>
    </>
  );
}
