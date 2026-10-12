const stripeMockModule = `export default class Stripe { constructor() { throw new Error("The Tournament paid-entry emulator test must inject its Stripe test double."); } }`;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "stripe") {
    return { url: `data:text/javascript,${encodeURIComponent(stripeMockModule)}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
