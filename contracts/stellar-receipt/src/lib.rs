#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env, Symbol,
};

const RECEIPT_TTL_THRESHOLD: u32 = 30 * 24 * 60 * 12;
const RECEIPT_TTL_EXTEND_TO: u32 = 365 * 24 * 60 * 12;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Receipt {
    pub owner: Address,
    pub public_commitment: BytesN<32>,
    pub proof_hash: BytesN<32>,
    pub platform: Symbol,
    pub content_hash: BytesN<32>,
    pub created_ledger: u32,
}

#[contractevent(topics = ["early", "receipt"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReceiptCreated {
    #[topic]
    pub owner: Address,
    #[topic]
    pub public_commitment: BytesN<32>,
    pub proof_hash: BytesN<32>,
    pub platform: Symbol,
    pub content_hash: BytesN<32>,
    pub created_ledger: u32,
}

#[contracttype]
pub enum DataKey {
    Receipt(BytesN<32>),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ReceiptError {
    ReceiptAlreadyExists = 1,
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
    ) -> Result<Receipt, ReceiptError> {
        owner.require_auth();

        let key = DataKey::Receipt(public_commitment.clone());

        if env.storage().persistent().has(&key) {
            return Err(ReceiptError::ReceiptAlreadyExists);
        }

        let receipt = Receipt {
            owner: owner.clone(),
            public_commitment: public_commitment.clone(),
            proof_hash: proof_hash.clone(),
            platform: platform.clone(),
            content_hash: content_hash.clone(),
            created_ledger: env.ledger().sequence(),
        };

        env.storage().persistent().set(&key, &receipt);
        env.storage().persistent().extend_ttl(
            &key,
            RECEIPT_TTL_THRESHOLD,
            RECEIPT_TTL_EXTEND_TO,
        );

        ReceiptCreated {
            owner,
            public_commitment,
            proof_hash,
            platform,
            content_hash,
            created_ledger: receipt.created_ledger,
        }
        .publish(&env);

        Ok(receipt)
    }

    pub fn get_receipt(env: Env, public_commitment: BytesN<32>) -> Option<Receipt> {
        let key = DataKey::Receipt(public_commitment);
        let receipt = env.storage().persistent().get(&key);

        if receipt.is_some() {
            env.storage().persistent().extend_ttl(
                &key,
                RECEIPT_TTL_THRESHOLD,
                RECEIPT_TTL_EXTEND_TO,
            );
        }

        receipt
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, BytesN, Env, Symbol};

    fn bytes(env: &Env, value: u8) -> BytesN<32> {
        BytesN::from_array(env, &[value; 32])
    }

    #[test]
    fn publishes_and_reads_receipt() {
        let env = Env::default();
        let contract_id = env.register(EarlyReceiptRegistry, ());
        let client = EarlyReceiptRegistryClient::new(&env, &contract_id);
        let owner = Address::generate(&env);
        let public_commitment = bytes(&env, 1);
        let proof_hash = bytes(&env, 2);
        let content_hash = bytes(&env, 3);
        let platform = Symbol::new(&env, "x");

        env.mock_all_auths();

        let receipt = client.publish_receipt(
            &owner,
            &public_commitment,
            &proof_hash,
            &platform,
            &content_hash,
        );

        assert_eq!(receipt.owner, owner);
        assert_eq!(receipt.public_commitment, public_commitment);
        assert_eq!(receipt.proof_hash, proof_hash);
        assert_eq!(receipt.platform, platform);
        assert_eq!(receipt.content_hash, content_hash);
        assert_eq!(receipt.created_ledger, env.ledger().sequence());

        assert_eq!(client.get_receipt(&public_commitment), Some(receipt));
    }

    #[test]
    fn rejects_duplicate_commitment() {
        let env = Env::default();
        let contract_id = env.register(EarlyReceiptRegistry, ());
        let client = EarlyReceiptRegistryClient::new(&env, &contract_id);
        let owner = Address::generate(&env);
        let public_commitment = bytes(&env, 4);
        let proof_hash = bytes(&env, 5);
        let content_hash = bytes(&env, 6);
        let platform = Symbol::new(&env, "x");

        env.mock_all_auths();

        client.publish_receipt(
            &owner,
            &public_commitment,
            &proof_hash,
            &platform,
            &content_hash,
        );

        let error = client.try_publish_receipt(
            &owner,
            &public_commitment,
            &proof_hash,
            &platform,
            &content_hash,
        );

        assert_eq!(error, Err(Ok(ReceiptError::ReceiptAlreadyExists)));
    }
}
