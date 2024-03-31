const natural = require("natural");
const fs = require("fs");
const readline = require("readline");
const request = require("request");
const nlp = require("compromise");

const symptomsCsvData = fs.readFileSync("symptom_Description.csv", "utf8");
const symptomsLines = symptomsCsvData.split("\n");
const symptomsData = symptomsLines
  .filter((line) => line.trim() !== "")
  .map((line) => {
    const [disease, description] = line.split(",");
    return {
      Disease: disease.trim().toLowerCase(),
      Description: description.trim(),
    };
  });

const csvContent = fs.readFileSync("symptom_precaution.csv", "utf8");
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

classifier.train();

const nutritionCsvData = fs.readFileSync("nutrients_csvfile.csv", "utf8");
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
  result += `- Calories: ${nutritionInfo[1]} kcal\n`;
  result += `- Protein: ${nutritionInfo[2]} g\n`;
  result += `- Fat: ${nutritionInfo[3]} g\n`;
  result += `- Saturated Fat: ${nutritionInfo[4]} g\n`;
  result += `- Fiber: ${nutritionInfo[5]} g\n`;
  result += `- Carbs: ${nutritionInfo[6]} g\n`;
  result += `- Category: ${nutritionInfo.slice(7).join(" ")}\n`;

  return result;
};

const displayAPIInformation = (nutritionInfo) => {
  let result = `Nutrition information for ${nutritionInfo.name}:\n`;
  result += `- Calories: ${nutritionInfo.calories} kcal\n`;
  result += `- Serving Size: ${nutritionInfo.serving_size_g} g\n`;
  result += `- Fat: ${nutritionInfo.fat_total_g} g\n`;
  result += `- Saturated Fat: ${nutritionInfo.fat_saturated_g} g\n`;
  result += `- Protein: ${nutritionInfo.protein_g} g\n`;
  result += `- Sodium: ${nutritionInfo.sodium_mg} mg\n`;
  result += `- Potassium: ${nutritionInfo.potassium_mg} mg\n`;
  result += `- Cholesterol: ${nutritionInfo.cholesterol_mg} mg\n`;
  result += `- Total Carbohydrates: ${nutritionInfo.carbohydrates_total_g} g\n`;
  result += `- Fiber: ${nutritionInfo.fiber_g} g\n`;
  result += `- Sugar: ${nutritionInfo.sugar_g} g\n`;

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
    if (nutritionInfo) {
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
    return `\n Symptoms for ${disease}: ${matchingSymptom.Description}`;
  }
  return "";
};

const promptUserInput = async () => {
  let res = await handleInput(userInput);
  if(res.length!==0)res+="\n";
  res += await lookupDiseaseRecommendations(userInput);
};

promptUserInput();
