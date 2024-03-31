const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const natural = require("natural");
const fs = require("fs");
const readline = require("readline");
const request = require("request");
const nlp = require("compromise");
const csvParser = require("csv-parser");
const app = express();

app.use(bodyParser.json());
app.use(cors());
app.use(helmet());

const port = process.env.PORT || 8080;

const atlasConnectionURI =
  "mongodb+srv://patmesh2003:<m7CtJEhB4FhGK7hM>@cluster0.b8mopbg.mongodb.net/?retryWrites=true&w=majority";
mongoose
  .connect(atlasConnectionURI, {
    authSource: "admin",
    user: "patmesh2003",
    pass: "m7CtJEhB4FhGK7hM",
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((error) => console.error("Error connecting to MongoDB:", error));

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  email: { type: String, unique: true, required: true },
  chatMessages: [
    {
      sender: { type: String, required: true },
      content: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
    },
  ],
});

const User = mongoose.model("User", userSchema);


//--------------nlp based code--------------


const symptomsCsvData = fs.readFileSync("./datasets/symptom_Description.csv", "utf8");
const symptomsLines = symptomsCsvData.split("\n");
const symptomsData = symptomsLines
  .filter((line) => line.trim() !== "")
  .map((line) => {
    const [disease, ...descriptionParts] = line.split(",");
    const description = descriptionParts.join(", ");
    return {
      Disease: disease.trim().toLowerCase(),
      Description: description.trim(),
    };
  });

const medquesData = new Map();
const medquesClassifier = new natural.BayesClassifier();
const medAnswerMap = new Map();
const diseaseSet = new Set();

// Read the question_enhanced_dataset.csv
fs.createReadStream("./datasets/question_enhanced_dataset.csv")
  .pipe(csvParser())
  .on("data", (row) => {
    const question = row["question"].trim();
    const label = row["label"].trim();
    const disease = row["disease"].trim();
    medquesData.set(question, label);
    diseaseSet.add(disease);
    medquesClassifier.addDocument(label, question);
  })
  .on("end", () => {
    // Train the question classifier
    medquesClassifier.train();
  });

fs.createReadStream("./datasets/answer_dataset.csv")
  .pipe(csvParser())
  .on("data", (row) => {
    const label = row["label"].trim();
    const answer = row["answer"].trim();
    medAnswerMap.set(label, answer);
  })

const csvContent = fs.readFileSync("./datasets/symptom_precaution.csv", "utf8");
const csvLines = csvContent.split("\n");
const diseaseMap = new Map();

csvLines.forEach((line) => {
  const [disease, ...recommendations] = line.split(",");
  diseaseMap.set(
    disease.trim().toLowerCase(),
    recommendations.map((r) => r.trim())
  );
});

const intents = JSON.parse(fs.readFileSync("intents.json", "utf8"));
const classifier = new natural.BayesClassifier();

intents.intents.forEach((intent) => {
  intent.patterns.forEach((pattern) => {
    classifier.addDocument(pattern, intent.tag);
  });
});

//train the intents.json
classifier.train();

const nutritionCsvData = fs.readFileSync("./datasets/nutrients_csvfile.csv", "utf8");
const nutritionLines = nutritionCsvData.split("\n");
const nutritionMap = new Map();

nutritionLines.forEach((line) => {
  const [food, ...nutritionValues] = line.split(",");
  nutritionMap.set(
    food.trim().toLowerCase(),
    nutritionValues.map((value) => value.trim())
  );
});

const nutritionKeywords = [
  "ingredients",
  "nutrition",
  "calories",
  "protein",
  "fat",
  "saturatedfat",
  "saturated",
  "fiber",
  "carbs",
  "vitamins",
  "minerals",
  "sugar",
  "cholesterol",
  "carbohydrates",
  "Potassium",
  "sodium",
  "fiber",
  "transfat",
  "serving",
  "intake",
  "glutenfree",
  "vegan",
  "vegetarian",
  "preservatives",
  "additives",
  "pairing",
  "facts",
  "restrictions",
  "intake",
  "values",
  "composition",
  "present",
];

const generalStopWords = [
  "is",
  "an",
  "of",
  "for",
  "about",
  "the",
  "and",
  "in",
  "with",
  "on",
  "to",
  "at",
  "by",
  "as",
  "from",
  "a",
  "your",
  "you",
  "we",
  "i",
  "are",
  "it",
  "this",
  "that",
  "these",
  "those",
  "what",
  "tell",
  "me",
  "my",
  "mine",
  "our",
  "ours",
  "yours",
  "his",
  "her",
  "hers",
  "its",
  "their",
  "theirs",
  "here",
  "there",
  "where",
  "when",
  "why",
  "how",
  "which",
  "who",
  "whom",
  "whose",
  "should",
  "would",
  "could",
  "can",
  "may",
  "might",
  "shall",
  "will",
  "must",
  "have",
  "had",
  "has",
  "having",
  "be",
  "been",
  "being",
  "like",
  "something",
  "do",
  "did",
  "me",
  "give",
];

const uniqueGeneralStopWords = [...new Set(generalStopWords)];

const displayNutritionInformation = (nutritionInfo) => {
  let result = `Nutrition information for ${nutritionInfo.foodName}:\n`;
  result += `- Serving Size: ${nutritionInfo[0]}\n`;
  result += `, Calories: ${nutritionInfo[1]} kcal\n`;
  result += `, Protein: ${nutritionInfo[2]} g\n`;
  result += `, Fat: ${nutritionInfo[3]} g\n`;
  result += `, Saturated Fat: ${nutritionInfo[4]} g\n`;
  result += `, Fiber: ${nutritionInfo[5]} g\n`;
  result += `, Carbs: ${nutritionInfo[6]} g\n`;
  result += `, Category: ${nutritionInfo.slice(7).join(" ")}\n`;

  return result;
};

const displayAPIInformation = (nutritionInfo) => {
  let result = `Nutrition information for ${nutritionInfo.name}:\n`;
  result += `- Calories: ${nutritionInfo.calories} kcal\n`;
  result += `, Serving Size: ${nutritionInfo.serving_size_g} g\n`;
  result += `, Fat: ${nutritionInfo.fat_total_g} g\n`;
  result += `, Saturated Fat: ${nutritionInfo.fat_saturated_g} g\n`;
  result += `, Protein: ${nutritionInfo.protein_g} g\n`;
  result += `, Sodium: ${nutritionInfo.sodium_mg} mg\n`;
  result += `, Potassium: ${nutritionInfo.potassium_mg} mg\n`;
  result += `, Cholesterol: ${nutritionInfo.cholesterol_mg} mg\n`;
  result += `, Total Carbohydrates: ${nutritionInfo.carbohydrates_total_g} g\n`;
  result += `, Fiber: ${nutritionInfo.fiber_g} g\n`;
  result += `, Sugar: ${nutritionInfo.sugar_g} g\n`;

  return result;
};

const extractFoodName = (userInput) => {
  const tokenizer = new natural.AggressiveTokenizer();
  const stopWords = new Set([...generalStopWords, ...nutritionKeywords]);

  const stemmer = natural.PorterStemmer;

  const preprocessToken = (token) => {
    return token.replace(/[^\w\s]|[\d]/g, "").toLowerCase();
  };

  const tokenizedInput = tokenizer
    .tokenize(userInput.toLowerCase())
    .map(preprocessToken)
    .filter((token) => !stopWords.has(token));

  for (const [food, values] of nutritionMap.entries()) {
    const tokenizedFood = tokenizer
      .tokenize(food.toLowerCase())
      .map(preprocessToken)
      .filter((token) => !stopWords.has(token));

    const intersection = new Set(
      [...tokenizedInput].filter((token) => tokenizedFood.includes(token))
    );
    const union = new Set([...tokenizedInput, ...tokenizedFood]);
    const similarity = intersection.size / union.size;

    const stemmedInput = tokenizedInput.map(stemmer.stem);
    const stemmedFood = tokenizedFood.map(stemmer.stem);

    const intersectionStemmed = new Set(
      [...stemmedInput].filter((token) => stemmedFood.includes(token))
    );
    const unionStemmed = new Set([...stemmedInput, ...stemmedFood]);
    const similarityStemmed = intersectionStemmed.size / unionStemmed.size;

    const finalSimilarity = Math.max(similarity, similarityStemmed);

    if (finalSimilarity > 0.2) {
      return food;
    }
  }
  return null;
};

const generateResponse = (intent) => {
  return intent.responses[Math.floor(Math.random() * intent.responses.length)];
};

const handleInput = async (input) => {

  if(containsDisease(input)){
    const classified = medquesClassifier.classify(input);
    if (medquesData.has(classified)) {
      return medAnswerMap.get(medquesData.get(classified));
    }
  }
  const classifiedIntent = classifier.classify(input.toLowerCase());
  let res = "";
  const intent = intents.intents.find(
    (intent) => intent.tag === classifiedIntent
  );
  if (intent) {
    const response = generateResponse(intent);
    res = (response);
  }
  const isNutritionQuery = nutritionKeywords.some((keyword) =>
    input.toLowerCase().includes(keyword)
  );
  if (isNutritionQuery) {
    const nutritionInfo = await generateNutritionaryResponse(input);
    if(nutritionInfo){
      res = displayNutritionInformation(nutritionInfo);
      return res;
    }
  }else {
    const nutritionInfo = await fetchNutritionFromAPI(input);
    if (nutritionInfo!=="tablet" && nutritionInfo) {
      let output = displayAPIInformation(nutritionInfo);
      res = output;
      return res;
    }
  }
  if(intent){
    return res;
  }
  if(!intent)return "Sorry, I didn't understand that.";
};

const generateNutritionaryResponse = (userInput) => {
  const foodName = extractFoodName(userInput);

  if (foodName) {
    const lowercaseFoodName = foodName.toLowerCase();
    let nutritionInfo = nutritionMap.get(lowercaseFoodName);
    if(nutritionInfo){
      nutritionInfo.foodName = foodName;
      return nutritionInfo;
    }
  } return null;
};

const fetchNutritionFromAPI = async (foodName) => {
  const apiKey = "uk6oCQqS3DT9mcSkaSGTlg==eZH81DhgLsE5WCl1";
  const query = encodeURIComponent(foodName);
  const apiUrl = `https://api.api-ninjas.com/v1/nutrition?query=${query}`;

  try {
    const response = await new Promise((resolve, reject) => {
      request.get(
        {
          url: apiUrl,
          headers: {
            "X-Api-Key": apiKey,
          },
        },
        (error, response, body) => {
          if (error) reject(error);
          else resolve({ response, body });
        }
      );
    });

    if (response.response.statusCode !== 200) {
      console.error("Error:", response.response.statusCode, response.body.toString("utf8"));
      return '';
    }

    const nutritionData = JSON.parse(response.body);
    if (nutritionData.length > 0) {
      return nutritionData[0];
    } else {
      return '';
    }
  } catch (error) {
    console.error("Request failed:", error);
    return '';
  }
};

const lookupDiseaseRecommendations = (userInput) => {
  const lowerCaseInput = userInput.toLowerCase();

  for (const [disease, recommendations] of diseaseMap) {
    if (lowerCaseInput.includes(disease)) {
      var res = `Recommendations for ${disease}: ${recommendations.join(", ")}`
      res+= checkSymptoms(disease);
      return res;
    }
  }
  return "";
};

const checkSymptoms = (disease) => {
  const matchingSymptom = symptomsData.find(
    (symptom) => symptom.Disease === disease
  );
  if (matchingSymptom) {
    return `.\n Symptoms for ${disease}: ${matchingSymptom.Description}`;
  }
  return ".";
};

app.post("/register", async (req, res) => {
  const { username, email } = req.body;
  try {
    await User.create({ username, email });
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error registering user" });
  }
});

app.post("/login", async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });
    const username = user.username;
    res.json({ message: "Login successful", username });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error during login" });
  }
});

app.get("/healthchat", async (req, res) => {
  const { username } = req.query;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ messages: user.chatMessages });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error retrieving chat" });
  }
});

function containsEmoji(inputString) {
  const emojiPattern = /[\u{1F600}-\u{1F6FF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  return emojiPattern.test(inputString);
}

const getResponse  = async(content) =>{
  if(containsEmoji(content)){
    const classifiedIntent = classifier.classify(content.toLowerCase());
    let res = "";
    const intent = intents.intents.find(
      (intent) => intent.tag === classifiedIntent
    );
    if (intent) {
      const response = generateResponse(intent);
      return response;
    }
  }

  let answer = await lookupDiseaseRecommendations(content);
  if(answer.length>0)return answer;
  let res = await handleInput(content);
  return res;
}

app.post("/healthchat", async (req, res) => {
  const { user } = req.body;
  const { content, type } = req.body.newMessageObj;
  try {
    const responseContent = await getResponse(content);
    const updatedUser = await User.findOneAndUpdate(
      { username: user },
      {
        $push: {
          chatMessages: [
            {
              sender: user,
              content,
              type,
              timestamp: new Date(),
            },
            {
              sender: "system",
              content: responseContent,
              type: "response",
              timestamp: new Date(),
            },
          ],
        },
      },
      { new: true }
    );

    res.json({ messages: responseContent });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating chat" });
  }
});


const containsDisease = (input) => {
  for (const disease of diseaseSet) {
    const diseaseParts = disease.toLowerCase().split(' '); 
    for (const part of diseaseParts) {
      if (input.toLowerCase().includes(part) && part.length >2) {
        return true;
      }
    }
  }
  return false;
};


app.listen(port, () => {
  console.log(`Server is running...`);
});
