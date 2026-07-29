import { assert, read, settlement } from "./settlement-test-utils.mjs";
const wallet = read("app/api/wallet/route.ts");
const source = settlement();
assert(wallet.includes('creditType: "dorocoin"') && wallet.includes("withdrawable: false") && wallet.includes("cashConvertible: false"), "DoroCoins must remain non-withdrawable and non-cash");
assert(!source.includes("doroCoinWallets") && !source.includes("doroCoinTransactions"), "cash settlement must not touch DoroCoin balances");
console.log("DoroCoin non-withdrawable settlement checks passed");
