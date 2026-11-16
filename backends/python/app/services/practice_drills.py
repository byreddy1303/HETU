"""Original, deterministic micro-exercises. Never official exam questions.

Each match identifies a topic to investigate, not the learner's mental cause.
Numeric answers are calculated; conceptual exercises have explicit assumptions.
"""

from __future__ import annotations

from fractions import Fraction


def question(prompt, choices, answer, explanation, kind="application"):
    return {
        "prompt": prompt,
        "choices": [str(x) for x in choices],
        "answer": answer,
        "explanation": explanation,
        "kind": kind,
    }


FAMILIES = {
    "translation": (
        "Preserve the page offset",
        "Translate the virtual page number, then add the unchanged offset.",
        "Paging with equal-sized pages and frames; addresses start at zero.",
        "A page boundary has offset zero, not the page size.",
        "https://pages.cs.wisc.edu/~remzi/OSTEP/vm-paging.pdf",
    ),
    "page-faults": (
        "Faults and replacements",
        "Every nonresident reference faults; replacement is needed only when no free frame "
        "remains.",
        "Demand paging; distinguish the specified replacement policy and lookahead window.",
        "Loading into an empty frame still counts as a fault.",
        "https://pages.cs.wisc.edu/~remzi/OSTEP/vm-beyondphys-policy.pdf",
    ),
    "mmu": (
        "Translation and permission checks",
        "Address translation and access checks use hardware support; OS software manages page "
        "tables and fault recovery.",
        "The exercise assumes hardware-managed paging and page permission enforcement.",
        "A present page can still cause a protection exception on a forbidden write.",
        "https://pages.cs.wisc.edu/~remzi/OSTEP/vm-paging.pdf",
    ),
    "context-switch": (
        "Kernel entry versus a process switch",
        "Entering the kernel does not by itself require choosing a different process.",
        "A process that must wait for unavailable I/O cannot continue running until the wait ends.",
        "A timer interrupt may return to the same process.",
        "https://pages.cs.wisc.edu/~remzi/OSTEP/cpu-mechanisms.pdf",
    ),
    "hamming": (
        "Distance, detection, and correction",
        "Use the minimum distance over all distinct codeword pairs; correction requires "
        "disjoint error balls.",
        "For minimum distance d, detect up to d−1 errors or correct up to floor((d−1)/2) errors.",
        "Distance three guarantees correction of one bit, not two.",
        "https://ocw.mit.edu/courses/6-02-introduction-to-eecs-ii-digital-communication-systems-fall-2012/",
    ),
    "crc": (
        "CRC and odd-weight errors",
        "Over GF(2), an error polynomial with an odd number of terms evaluates to one at x=1.",
        "An undetected error must be divisible by the generator. A generator containing x+1 "
        "detects all odd-weight errors.",
        "Having many terms alone does not guarantee the factor x+1.",
        "https://ocw.mit.edu/courses/6-02-introduction-to-eecs-ii-digital-communication-systems-fall-2012/",
    ),
    "backoff": (
        "Count unequal backoff choices",
        "Enumerate independent random backoff choices using each frame's own collision history.",
        "Classic half-duplex Ethernet binary exponential backoff; distinguish ties from one "
        "station winning.",
        "Two stations need not have equal windows after one station has successfully sent its "
        "frame.",
        "https://intronetworks.cs.luc.edu/current2/ComputerNetworks/ethernet1.html",
    ),
    "window": (
        "Window size and sequence space",
        "Compute the needed in-flight frames, then apply the protocol's sequence-number "
        "constraint.",
        "With k bits, Go-Back-N allows W≤2^k−1; equal sender/receiver windows in Selective "
        "Repeat require W≤2^(k−1).",
        "The same required window can need different sequence bits under the two protocols.",
        "https://sites.uclouvain.be/CNP3/1st/html/transport/transport.html",
    ),
    "stop-wait": (
        "Account for the whole transmission cycle",
        "Separate useful payload time from data transmission, propagation, ACK transmission, "
        "and processing.",
        "Stop-and-wait, no losses; explicitly include only the delays specified by the problem.",
        "Payload bytes exclude header bytes even though both consume transmission time.",
        "https://sites.uclouvain.be/CNP3/1st/html/transport/transport.html",
    ),
    "regular-language": (
        "Check existential witnesses",
        "To prove membership in a language defined by some decomposition, one valid witness is "
        "enough.",
        "Check all nonempty/empty restrictions; distinguish a fixed word from an arbitrarily "
        "repeated word.",
        "A repeated variable in notation does not by itself prove nonregularity.",
        "https://ocw.mit.edu/courses/18-404j-theory-of-computation-fall-2020/",
    ),
}


def classify(text: str) -> str | None:
    value = text.lower()
    # Specific conditions precede broad paging/network terms.
    for key, patterns in [
        ("context-switch", ["context switch"]),
        ("mmu", ["memory management unit", "mmu"]),
        ("page-faults", ["page replacement", "page faults"]),
        ("translation", ["physical address", "page table", "page-table", "virtual address"]),
        ("hamming", ["hamming", "distance of the", "codewords"]),
        ("crc", ["crc", "generator polynomial"]),
        ("backoff", ["backoff", "collide"]),
        ("stop-wait", ["stop-and-wait", "stop and wait"]),
        ("window", ["sliding window", "selective repeat", "go-back-n"]),
        ("regular-language", ["regular language", "regularity"]),
    ]:
        if any(pattern in value for pattern in patterns):
            return key
    return None


def exercises(family: str, round_number: int = 0) -> list[dict]:
    n = round_number % 7
    q = question
    if family == "translation":
        size, vpn, offset, frame = 1024 * (2 ** (n % 3)), 2 + n, 137 + n, 5 + n
        address = vpn * size + offset
        return [
            q(
                "During ordinary paging translation, which part of an address is preserved?",
                ["Page offset", "Virtual page number", "Entire address"],
                0,
                "Translation replaces the page number with a frame number; the offset is "
                "unchanged.",
                "recognition",
            ),
            q(
                f"Pages contain {size} bytes. Virtual page {vpn} maps to frame {frame}. "
                f"What physical byte address corresponds to virtual address {address}?",
                [frame * size + offset, frame * size, vpn * size + offset],
                0,
                f"VPN={vpn}, offset={offset}; "
                f"physical address={frame}×{size}+{offset}={frame * size + offset}.",
            ),
            q(
                f"With {size}-byte pages, virtual page {vpn + 1} maps to frame {frame + 1}. "
                f"Translate virtual address {(vpn + 1) * size}.",
                [(frame + 1) * size + size - 1, (frame + 1) * size, frame * size],
                1,
                f"This is an exact page boundary. Offset=0, "
                f"so the address is {(frame + 1) * size}.",
                "boundary",
            ),
        ]
    if family == "page-faults":
        return [
            q(
                "A requested page is absent, and a free frame exists. What occurs?",
                ["A fault and no eviction", "No fault", "A fault and a mandatory eviction"],
                0,
                "The reference faults because the page is absent. A free frame avoids eviction.",
                "recognition",
            ),
            q(
                "Two initially empty frames use FIFO. For references 1, 2, 1, 3, 2, how many "
                "faults occur?",
                [2, 3, 4],
                1,
                "Faults occur at 1, 2, and 3. Page 1 is evicted on loading 3; the final 2 is "
                "still resident.",
            ),
            q(
                "Frames hold A, B, C; D must now be loaded. The next uses after D are B, A, C. "
                "Under full-lookahead optimal replacement, which resident page is evicted?",
                ["D", "B", "C"],
                2,
                "C is used farthest in the future. Incoming D is not one of the resident victim"
                " candidates.",
                "boundary",
            ),
        ]
    if family == "mmu":
        return [
            q(
                "A user process writes to a present, read-only page. What should "
                "access-checking hardware do?",
                [
                    "Allow it because the page is present",
                    "Raise a protection exception",
                    "Allocate a new process",
                ],
                1,
                "Presence and write permission are distinct checks.",
                "recognition",
            ),
            q(
                "Who normally allocates and initializes a new process's page table?",
                ["OS software", "The address offset", "The MMU acting as the process scheduler"],
                0,
                "The OS manages the page-table data structure. The MMU uses translation and "
                "permission information.",
            ),
            q(
                "An address has a valid mapping but lacks execute permission. Does successful "
                "address translation imply instruction fetch is allowed?",
                ["Yes", "No"],
                1,
                "A translated address can still fail its execute-permission check.",
                "boundary",
            ),
        ]
    if family == "context-switch":
        return [
            q(
                "A timer interrupt enters the kernel. Must a different user process run next?",
                ["Yes, always", "No; the scheduler may resume the same process"],
                1,
                "Kernel entry and a switch to another process are different events.",
                "recognition",
            ),
            q(
                "P requests disk data that is unavailable and must block until I/O completes. "
                "Can P continue executing user instructions while blocked?",
                ["Yes", "No"],
                1,
                "A blocked process cannot continue until it becomes runnable.",
            ),
            q(
                "An interrupt announces completion of another process's I/O. With no specified "
                "scheduling policy, is preemption of the current process guaranteed?",
                ["Guaranteed", "Possible, not guaranteed"],
                1,
                "Whether to preempt depends on the scheduler and runnable processes.",
                "boundary",
            ),
        ]
    if family == "hamming":
        d = 3 + n
        return [
            q(
                "Which quantity defines a code's minimum Hamming distance?",
                [
                    "Average pairwise distance",
                    "Smallest distance between distinct valid codewords",
                    "Number of codewords",
                ],
                1,
                "One close pair limits the guarantee for the entire code.",
                "recognition",
            ),
            q(
                f"A binary code has minimum distance {d}. "
                f"How many arbitrary bit errors can it guarantee to correct?",
                [(d - 1) // 2, d - 1, d],
                0,
                f"Disjoint correction balls require 2t<d; t=floor(({d}−1)/2)={(d - 1) // 2}.",
            ),
            q(
                "A code contains 0000, 1110, and 1101. What is its minimum distance?",
                [2, 3, 4],
                0,
                "The pairwise distances are 3, 3, and 2. Compare every pair, not only pairs "
                "involving 0000.",
                "boundary",
            ),
        ]
    if family == "crc":
        return [
            q(
                "Over GF(2), which generator factor guarantees detection of every odd-weight "
                "error?",
                ["x", "x+1", "Degree at least three alone"],
                1,
                "An odd-weight error has E(1)=1 and cannot be divisible by x+1.",
                "recognition",
            ),
            q(
                "Does G(x)=x³+x²+x+1 have x+1 as a factor over GF(2)?",
                ["Yes", "No"],
                0,
                "G(1)=1+1+1+1=0 over GF(2); the factor theorem applies.",
            ),
            q(
                "Does G(x)=x⁴+x+1 guarantee detection of every odd-weight error?",
                ["Yes, because its degree is four", "No"],
                1,
                "G(1)=1. The odd-weight error E(x)=G(x) itself is divisible by G and is "
                "undetected.",
                "boundary",
            ),
        ]
    if family == "backoff":
        slots = 4 * 2 ** (n % 3)
        probability = Fraction(2 * slots - 3, 2 * slots)
        return [
            q(
                "After A succeeds and starts a new frame while B retries an old collided frame,"
                " must their collision counters match?",
                ["Yes", "No"],
                1,
                "Backoff history belongs to the frame being retried; a new frame restarts its "
                "history.",
                "recognition",
            ),
            q(
                f"A independently chooses uniformly from {{0,1}}; B from {{0,…,{slots - 1}}}. "
                f"What is P(A's choice < B's choice), counting ties as no winner?",
                [str(probability), "1/2", "1"],
                0,
                f"There are {2 * slots} equiprobable pairs. "
                f"A wins in ({slots}-1)+({slots}-2)={2 * slots - 3} of them.",
            ),
            q(
                "A and B independently choose uniformly from {0,1}. What is the probability of "
                "a tie in this draw?",
                ["0", "1/4", "1/2"],
                2,
                "The four pairs are (0,0),(0,1),(1,0),(1,1); two tie.",
                "boundary",
            ),
        ]
    if family == "window":
        k = 3 + n % 3
        return [
            q(
                f"Go-Back-N uses {k}-bit sequence numbers. "
                f"What is the maximum sender window under the usual receiver-window-one protocol?",
                [2**k, 2**k - 1, 2 ** (k - 1)],
                1,
                f"Reserve one sequence value: W≤2^{k}−1={2**k - 1}.",
                "recognition",
            ),
            q(
                f"Selective Repeat uses {k}-bit sequence numbers "
                "and equal sender/receiver windows. "
                f"What is the largest safe window?",
                [2**k - 1, 2 ** (k - 1), 2**k],
                1,
                f"The sequence space must cover twice the window: W≤2^({k}−1)={2 ** (k - 1)}.",
            ),
            q(
                "Data transmission takes 1 ms; one-way propagation is 2 ms. With negligible ACK"
                " transmission and processing, how many frames must a sender window hold to "
                "avoid an idle gap?",
                [4, 5, 6],
                1,
                "The first ACK returns after 1+2+2=5 ms. Five 1-ms transmissions fill that "
                "interval.",
                "boundary",
            ),
        ]
    if family == "stop-wait":
        t, prop = 4 + n, 2
        percent = Fraction(t, t + 2 * prop)
        return [
            q(
                "A stop-and-wait sender uses 1,000 payload bytes and 20 header bytes per frame."
                " Which bytes belong in useful throughput's numerator?",
                [1020, 1000, 20],
                1,
                "Useful throughput counts payload; header bytes still contribute to "
                "transmission time.",
                "recognition",
            ),
            q(
                f"A frame takes {t} ms to transmit; one-way propagation is {prop} ms. "
                "ACK transmission and all processing are negligible. "
                "What fraction of the cycle transmits data?",
                [str(percent), "1", str(Fraction(t, t + prop))],
                0,
                f"Cycle={t}+2×{prop}={t + 2 * prop} ms; utilization={percent}.",
            ),
            q(
                "Data transmission is 8 ms, one-way propagation 1 ms, ACK transmission 2 ms, "
                "and receiver processing 1 ms. Sender processing is negligible. What is one "
                "stop-and-wait cycle?",
                [11, 12, 13],
                2,
                "8+1+1+2+1=13 ms: data transmission, outward propagation, processing, ACK "
                "transmission, return propagation.",
                "boundary",
            ),
        ]
    if family == "regular-language":
        return [
            q(
                "Membership is defined by existence of nonempty α and β with w=αβα. How many "
                "valid decompositions must you find to prove membership?",
                ["One", "Every possible decomposition", "Exactly two"],
                0,
                "An existential condition needs one witness. A failed choice does not prove "
                "non-membership.",
                "recognition",
            ),
            q(
                "For L={αβα : α∈a⁺, β∈{a,b}⁺}, which regular expression describes L?",
                ["a(a|b)⁺a", "a(a|b)*", "(a|b)*a"],
                0,
                "Every member starts and ends in a and has length at least three. Conversely "
                "choose α=a and β as the nonempty middle.",
            ),
            q(
                "Does aa belong to L={αβα : α∈a⁺, β∈{a,b}⁺}?",
                ["Yes", "No"],
                1,
                "Both copies of α and the nonempty β require at least three symbols.",
                "boundary",
            ),
        ]
    raise ValueError("Unsupported exercise family")


def catalog_entry(key: str, round_number: int = 0) -> dict:
    title, principle, conditions, counterexample, source = FAMILIES[key]
    return {
        "family": key,
        "title": title,
        "principle": principle,
        "conditions": conditions,
        "counterexample": counterexample,
        "source_url": source,
        "questions": exercises(key, round_number),
        "version": 1,
        "provenance": "Original HETU exercises; assistant-authored and reviewed, not official PYQs",
    }
