import { NextResponse } from "next/server";
import { createWalletClient, erc20Abi, http, parseUnits, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { errorResponse } from "@/lib/api";
import { localRpcUrl, targetChain } from "@/lib/chain";
import { getMockUsdcAddress, mockUsdcAbi } from "@/lib/contracts";
import { AuthError, readIdentityToken, walletFromIdentityToken } from "@/lib/privy-server";

/**
 * Puts test USDC in the wallet of whoever just signed in, without them asking.
 *
 * Somebody arriving to try this has a wallet, some Sepolia ETH, and no reason to know that
 * the money here is a token we wrote. Making them find /dev and press a button before the
 * marketplace does anything is a step at the exact moment they are deciding whether to
 * bother.
 *
 * It mints rather than transferring. MockUSDC.mint is open on purpose, so there is no
 * treasury to keep topped up and no balance that runs out halfway through a demo. The
 * server pays the gas, which is why the two guards below exist.
 *
 * Guard one: the caller has to be signed in, and the address is read from their Privy
 * token rather than from the request. Without that this is a public endpoint that spends
 * our gas on any address a script cares to name.
 *
 * Guard two: only when they are actually short. Somebody who already has enough gets
 * nothing, so the cost is one transaction per person rather than one per page load.
 */
const TOP_UP = "10000";
const ENOUGH = "1000";

/** Test networks only. Real money needs no faucet and this would be a hole in one. */
const ALLOWED_CHAINS = [31337, 11155111];

export async function POST(request: Request) {
  try {
    if (!ALLOWED_CHAINS.includes(targetChain.id)) {
      return NextResponse.json({ error: "Not on this network." }, { status: 404 });
    }

    const to = await walletFromIdentityToken(await readIdentityToken(request));
    const usdc = getMockUsdcAddress(targetChain.id);
    if (!usdc) return NextResponse.json({ error: "No token on this network." }, { status: 503 });

    const key = process.env.AGENT_SIGNER_PRIVATE_KEY;
    if (!key) {
      return NextResponse.json({ error: "The faucet has no wallet." }, { status: 503 });
    }

    const wallet = createWalletClient({
      account: privateKeyToAccount(key.startsWith("0x") ? (key as `0x${string}`) : `0x${key}`),
      chain: targetChain,
      transport: http(targetChain.id === 31337 ? localRpcUrl : undefined),
    }).extend(publicActions);

    const held = await wallet.readContract({
      address: usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [to as `0x${string}`],
    });

    if (held >= parseUnits(ENOUGH, 6)) {
      return NextResponse.json({ minted: false, reason: "already funded" });
    }

    const hash = await wallet.writeContract({
      address: usdc,
      abi: mockUsdcAbi,
      functionName: "mint",
      args: [to as `0x${string}`, parseUnits(TOP_UP, 6)],
    });

    // Waited for, because the browser refetches the balance the moment this answers and a
    // reply that arrives before the transaction is mined shows the old number.
    await wallet.waitForTransactionReceipt({ hash });

    return NextResponse.json({ minted: true, amount: TOP_UP, hash });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error, 401);
    return errorResponse(error);
  }
}
