import type { Label, Model, Text } from '@uio/engine';
import { DataFactory, type Literal, type NamedNode, type Quad } from 'n3';
import { DCT, type Iris, ORG, RDF, RDFS, SKOS, XSD } from './iris.ts';

const { namedNode, literal, quad } = DataFactory;

const type = `${RDF}type`;

/** `xsd:integer` and `xsd:boolean` and `xsd:date` literals; a plain string is never a datatype. */
const integer = (value: number): Literal => literal(String(value), namedNode(`${XSD}integer`));
const boolean = (value: boolean): Literal =>
  literal(value ? 'true' : 'false', namedNode(`${XSD}boolean`));
const date = (value: string): Literal => literal(value, namedNode(`${XSD}date`));

/** Collects the quads of one node: `add` for one object, `texts` for a language-tagged text. */
function nodeWriter(quads: Quad[], iri: string) {
  const subject = namedNode(iri);
  const add = (predicate: string, object: NamedNode | Literal): void => {
    quads.push(quad(subject, namedNode(predicate), object));
  };
  return {
    add,
    types: (...classes: string[]): void => {
      for (const iriOfClass of classes) add(type, namedNode(iriOfClass));
    },
    /** One literal per language, the label key as the language tag. */
    texts: (predicate: string, text: Label | Text | undefined): void => {
      if (text === undefined) return;
      for (const [language, value] of Object.entries(text)) {
        if (typeof value === 'string') add(predicate, literal(value, language));
      }
    },
    plain: (predicate: string, value: string | undefined): void => {
      if (value !== undefined) add(predicate, literal(value));
    },
  };
}

/**
 * The unsourced structure of the graph as plain triples (D-05): schemes, authorities,
 * jurisdictions, sources, vocabularies and their members, with their labels. Everything a
 * Statement points to (its certainty and its source) exists as one of these nodes.
 */
export function structureQuads(model: Model, iris: Iris): Quad[] {
  const quads: Quad[] = [];

  for (const scheme of Object.values(model.schemes)) {
    const node = nodeWriter(quads, iris.scheme(scheme.id));
    node.types(`${SKOS}ConceptScheme`, iris.def('Scheme'));
    node.texts(`${SKOS}prefLabel`, scheme.label);
    node.texts(`${SKOS}scopeNote`, scheme.scope);
    node.texts(`${SKOS}note`, scheme.notes);
    for (const value of scheme.format?.examples_valid ?? []) {
      node.plain(iris.def('exampleValid'), value);
    }
    for (const value of scheme.format?.examples_invalid ?? []) {
      node.plain(iris.def('exampleInvalid'), value);
    }
  }

  for (const authority of Object.values(model.authorities)) {
    const node = nodeWriter(quads, iris.authority(authority.id));
    node.types(
      `${ORG}Organization`,
      iris.def(authority.kind === 'class' ? 'AuthorityClass' : 'Authority'),
    );
    node.texts(`${SKOS}prefLabel`, authority.label);
    node.texts(`${SKOS}definition`, authority.definition);
    node.texts(`${SKOS}note`, authority.notes);
  }

  for (const jurisdiction of Object.values(model.jurisdictions)) {
    const node = nodeWriter(quads, iris.jurisdiction(jurisdiction.id));
    node.types(iris.def('Jurisdiction'));
    node.texts(`${SKOS}prefLabel`, jurisdiction.label);
    node.texts(`${SKOS}note`, jurisdiction.notes);
  }

  for (const source of Object.values(model.sources)) {
    const node = nodeWriter(quads, iris.source(source.id));
    node.types(iris.def('Source'));
    node.plain(`${DCT}title`, source.title);
    node.add(`${DCT}date`, date(source.date));
    node.plain(`${DCT}type`, source.type);
    node.plain(`${DCT}publisher`, source.publisher);
    node.plain(`${DCT}identifier`, source.reference);
    node.plain(iris.def('method'), source.method);
    if (source.url !== undefined) node.add(`${RDFS}seeAlso`, namedNode(source.url));
    if (source.eli !== undefined) node.add(iris.def('eli'), namedNode(source.eli));
    node.plain(iris.def('expertRole'), source.role);
    node.plain(iris.def('organisation'), source.organisation);
  }

  for (const vocabulary of Object.values(model.vocab)) {
    const vocabularyIri = iris.vocab(vocabulary.id);
    const node = nodeWriter(quads, vocabularyIri);
    node.types(`${SKOS}ConceptScheme`, iris.def('Vocabulary'));
    node.texts(`${SKOS}prefLabel`, vocabulary.label);

    for (const member of vocabulary.values) {
      // The country-prefix vocabulary keys its members by prefix (DEC-056).
      const key = member.id ?? member.prefix;
      if (key === undefined) continue;
      const memberNode = nodeWriter(quads, iris.member(vocabulary.id, key));
      memberNode.types(`${SKOS}Concept`, iris.def('VocabularyMember'));
      memberNode.add(`${SKOS}inScheme`, namedNode(vocabularyIri));
      memberNode.texts(`${SKOS}prefLabel`, member.label);
      memberNode.texts(`${SKOS}definition`, member.definition);
      if (member.rank !== undefined) memberNode.add(iris.def('rank'), integer(member.rank));
      if (member.inherits_down !== undefined) {
        memberNode.add(iris.def('inheritsDown'), boolean(member.inherits_down));
      }
      memberNode.texts(`${SKOS}note`, member.rationale);
      memberNode.texts(`${SKOS}note`, member.note);
      memberNode.plain(`${SKOS}notation`, member.prefix);
    }
  }

  return quads;
}
