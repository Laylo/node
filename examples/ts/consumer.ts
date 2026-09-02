import Laylo, {
  Laylo as Named,
  LayloAPIError,
  VERSION,
  type ClientOptions,
  type RequestOptions,
} from "@laylo/node";

const options: ClientOptions = {
  clientId: process.env.LAYLO_CLIENT_ID,
  clientSecret: process.env.LAYLO_CLIENT_SECRET,
  source: "laylo-node-examples",
};

const laylo: Laylo = new Laylo(options);

const scoped: Named = laylo.forCustomer("example-customer-api-key");
const perCall: RequestOptions = { apiKey: "another-customer-api-key" };

const describeKeys = async (): Promise<void> => {
  const verified: Awaited<ReturnType<Laylo["keys"]["verify"]>> =
    await scoped.keys.verify();
  console.log(`@laylo/node ${VERSION}: ${verified.apiKeyStatus}`);

  try {
    await laylo.keys.verify(perCall);
  } catch (error) {
    if (error instanceof LayloAPIError) {
      console.error(`${String(error.status)}: ${error.message}`);
      return;
    }
    throw error;
  }
};

void describeKeys();
