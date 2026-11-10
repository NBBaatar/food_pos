import type { JSX as ReactJSX } from 'react';

/**
 * React 19-ийн төрлүүд глобал JSX namespace-ыг хасcан тул буцааж бүрдүүлнэ.
 * Ингэснээр `JSX.Element` гэсэн богино тэмдэглэгээ бүх файлд ажиллана.
 */
declare global {
  namespace JSX {
    interface Element extends ReactJSX.Element {}
    interface ElementClass extends ReactJSX.ElementClass {}
    interface ElementAttributesProperty extends ReactJSX.ElementAttributesProperty {}
    interface ElementChildrenAttribute extends ReactJSX.ElementChildrenAttribute {}
    interface IntrinsicAttributes extends ReactJSX.IntrinsicAttributes {}
    interface IntrinsicClassAttributes<T> extends ReactJSX.IntrinsicClassAttributes<T> {}
    interface IntrinsicElements extends ReactJSX.IntrinsicElements {}
  }
}

export {};
