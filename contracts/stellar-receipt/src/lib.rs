#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env, Symbol};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Receipt {
    pub owner: Address,
    pub proof_hash: BytesN<32>,
    pub platform: Symbol,
    pub content_hash: BytesN<32>,
    pub created_ledger: u32,
}

#[contracttype]
pub enum DataKey {
    Receipt(BytesN<32>),
}

#[contract]
pub struct EarlyReceiptRegistry;

#[contractimpl]
impl EarlyReceiptRegistry {
    pub fn publish_receipt(
        env: Env,
        owner: Address,
        public_commitment: BytesN<32>,
        proof_hash: BytesN<32>,
        platform: Symbol,
        content_hash: BytesN<32>,
    ) {
        owner.require_auth();

        let key = DataKey::Receipt(public_commitment.clone());

        if env.storage().persistent().has(&key) {
            panic!("receipt already exists");
        }

        let receipt = Receipt {
            owner: owner.clone(),
            proof_hash,
            platform,
            content_hash,
            created_ledger: env.ledger().sequence(),
        };

        env.storage().persistent().set(&key, &receipt);
        env.events()
            .publish((symbol_short!("receipt"), owner), public_commitment);
    }

    pub fn get_receipt(env: Env, public_commitment: BytesN<32>) -> Option<Receipt> {
        env.storage()
            .persistent()
            .get(&DataKey::Receipt(public_commitment))
    }
}
