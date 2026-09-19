"""Deterministic 32-bit PRNG (mulberry32) so every maze is reproducible from its seed."""

_M32 = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    return (a * b) & _M32


def mulberry32(seed: int):
    a = seed & _M32

    def rng() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & _M32
        t = a
        t = _imul(t ^ (t >> 15), t | 1)
        t ^= (t + _imul(t ^ (t >> 7), t | 61)) & _M32
        return ((t ^ (t >> 14)) & _M32) / 4294967296

    return rng


def hash_seed(a: int, b: int) -> int:
    """Mix two integers into one seed."""
    return (_imul((a ^ 0x9E3779B9) & _M32, 0x85EBCA6B) ^ _imul((b + 0x7F4A7C15) & _M32, 0xC2B2AE35)) & _M32
