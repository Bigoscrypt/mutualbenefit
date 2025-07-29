import './index.css';
import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, addDoc, serverTimestamp } from 'firebase/firestore';


// Define a context for Firebase and User data
const AppContext = createContext(null);

// Helper function to format timestamps
const formatTimestamp = (timestamp) => {
  if (!timestamp) return 'N/A';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString();
};

const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [userName, setUserName] = useState('');
  const [xUsername, setXUsername] = useState('');
  const [hasEnteredInfo, setHasEnteredInfo] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [links, setLinks] = useState([]);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'

  // Initialize Firebase and set up auth listener
 useEffect(() => {
  try {
    console.log("🚀 Starting Firebase initialization...");

    const appId = process.env.REACT_APP_APP_ID || 'default-app-id';
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};


    console.log("🔧 Firebase config:", firebaseConfig);

    const app = initializeApp(firebaseConfig);
    const firestore = getFirestore(app);
    const firebaseAuth = getAuth(app);

    setDb(firestore);
    setAuth(firebaseAuth);

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      console.log("👤 Auth state changed. User:", user);

      if (user) {
        setUserId(user.uid);
        console.log("📄 Fetching user profile...");

        const userDocRef = doc(firestore, `artifacts/${appId}/users/${user.uid}/profile/data`);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const profileData = userDocSnap.data();
          console.log("✅ Profile found:", profileData);

          setUserProfile(profileData);
          setUserName(profileData.name);
          setXUsername(profileData.xUsername);
          setHasEnteredInfo(true);
        } else {
          console.log("ℹ️ No existing profile for user.");
        }
      } else {
        console.log("🙍 No user signed in. Trying anonymous or token login...");

        if (typeof __initial_auth_token !== 'undefined') {
          await signInWithCustomToken(firebaseAuth, __initial_auth_token);
          console.log("🔐 Signed in with custom token.");
        } else {
          await signInAnonymously(firebaseAuth);
          console.log("🕵️ Signed in anonymously.");
        }
      }

      setIsAuthReady(true);
      console.log("✅ Auth ready!");
    });

    return () => unsubscribe();
  } catch (error) {
    console.error("❌ Error initializing Firebase:", error);
    setMessage("Failed to initialize the app. Please try again later.");
    setMessageType("error");
    setIsAuthReady(true); // Avoid infinite loading if Firebase fails
  }
}, []);


  // Fetch user profile and links once auth is ready
  useEffect(() => {
    if (!isAuthReady || !db || !userId) return;

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

    // Listener for user profile changes
    const userDocRef = doc(db, `artifacts/${appId}/users/${userId}/profile/data`);
    const unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const profileData = docSnap.data();
        setUserProfile(profileData);
        setUserName(profileData.name);
        setXUsername(profileData.xUsername);
        setHasEnteredInfo(true);
      } else {
        setUserProfile(null);
        setHasEnteredInfo(false);
      }
    }, (error) => {
      console.error("Error fetching user profile:", error);
      setMessage("Failed to load user profile.");
      setMessageType("error");
    });

    // Listener for links
    const linksCollectionRef = collection(db, `artifacts/${appId}/public/data/links`);
    const unsubscribeLinks = onSnapshot(linksCollectionRef, (snapshot) => {
      const fetchedLinks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort links by timestamp in descending order (newest first)
      fetchedLinks.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));
      setLinks(fetchedLinks);
    }, (error) => {
      console.error("Error fetching links:", error);
      setMessage("Failed to load links.");
      setMessageType("error");
    });

    return () => {
      unsubscribeProfile();
      unsubscribeLinks();
    };
  }, [isAuthReady, db, userId]);

  const displayMessage = (msg, type) => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => {
      setMessage('');
      setMessageType('');
    }, 3000);
  };

  const handleEnterInfo = async () => {
    if (!userName || !xUsername) {
      displayMessage('Please enter both your name and X username.', 'error');
      return;
    }
    if (!db || !userId) {
      displayMessage('App not ready. Please wait.', 'error');
      return;
    }

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const userDocRef = doc(db, `artifacts/${appId}/users/${userId}/profile/data`);

    try {
      await setDoc(userDocRef, {
        name: userName,
        xUsername: xUsername,
        lastLinkSubmissionTimestamp: null, // Initialize
        lastEngagementTimestamp: null, // Initialize
        userId: userId // Store userId in profile for easier lookup
      }, { merge: true });
      setUserProfile({ name: userName, xUsername: xUsername, userId: userId });
      setHasEnteredInfo(true);
      displayMessage('Profile saved successfully!', 'success');
    } catch (error) {
      console.error("Error saving user info:", error);
      displayMessage('Failed to save your information. Please try again.', 'error');
    }
  };

  const handleEngageLink = useCallback(async (linkId, url) => {
    if (!db || !userId || !userProfile) {
      displayMessage('Please sign in or complete your profile first.', 'error');
      return;
    }

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const linkDocRef = doc(db, `artifacts/${appId}/public/data/links`, linkId);
    const userDocRef = doc(db, `artifacts/${appId}/users/${userId}/profile/data`);

    try {
      // Open the link in a new tab
      window.open(url, '_blank');

      // Record engagement in link's document
      // Use new Date() instead of serverTimestamp() inside arrays
      await updateDoc(linkDocRef, {
        engagements: [...(links.find(l => l.id === linkId)?.engagements || []), { userId, timestamp: new Date() }]
      });

      // Update user's last engagement timestamp
      await updateDoc(userDocRef, {
        lastEngagementTimestamp: serverTimestamp()
      });

      displayMessage('Engagement recorded! The link opened in a new tab.', 'success');
    } catch (error) {
      console.error("Error engaging with link:", error);
      displayMessage('Failed to record engagement. Please try again.', 'error');
    }
  }, [db, userId, userProfile, links]);

  const handleReactLink = useCallback(async (linkId, reactionType) => {
    if (!db || !userId || !userProfile) {
      displayMessage('Please sign in or complete your profile first.', 'error');
      return;
    }

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const linkDocRef = doc(db, `artifacts/${appId}/public/data/links`, linkId);

    try {
      const link = links.find(l => l.id === linkId);
      const hasEngaged = link?.engagements?.some(e => e.userId === userId) || false;

      if (!hasEngaged) {
        displayMessage('You must engage with the link before reacting to it.', 'error');
        return;
      }

      const currentReactions = link?.reactions || {};
      const newReactions = { ...currentReactions, [userId]: reactionType };

      await updateDoc(linkDocRef, {
        reactions: newReactions
      });

      displayMessage(`You reacted with ${reactionType}!`, 'success');
    } catch (error) {
      console.error("Error reacting to link:", error);
      displayMessage('Failed to record reaction. Please try again.', 'error');
    }
  }, [db, userId, userProfile, links]);

  const handleSubmitLink = async () => {
    if (!newLinkUrl) {
      displayMessage('Please enter a link URL.', 'error');
      return;
    }
    if (!db || !userId || !userProfile) {
      displayMessage('App not ready. Please wait.', 'error');
      return;
    }

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const userDocRef = doc(db, `artifacts/${appId}/users/${userId}/profile/data`);

    try {
      // Check 24-hour cooldown for submission
      if (userProfile?.lastLinkSubmissionTimestamp) {
        const lastSubmissionTime = userProfile.lastLinkSubmissionTimestamp.toDate();
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (lastSubmissionTime > twentyFourHoursAgo) {
          displayMessage('You can only submit one link every 24 hours.', 'error');
          setShowSubmitModal(false);
          return;
        }
      }

      // Check for engagement within the last 24 hours
      if (userProfile?.lastEngagementTimestamp) {
        const lastEngagementTime = userProfile.lastEngagementTimestamp.toDate();
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (lastEngagementTime < twentyFourHoursAgo) {
          displayMessage('You must engage with another link within the last 24 hours before submitting a new one.', 'error');
          setShowSubmitModal(false);
          return;
        }
      } else {
        // If no engagement ever, require engagement
        if (links.length > 0) { // Only if there are links to engage with
          displayMessage('You must engage with another link before submitting your first one.', 'error');
          setShowSubmitModal(false);
          return;
        }
      }

      // Add new link
      const linksCollectionRef = collection(db, `artifacts/${appId}/public/data/links`);
      await addDoc(linksCollectionRef, {
        url: newLinkUrl,
        submittedByUserId: userId,
        submittedByName: userProfile.name,
        submittedByXUsername: userProfile.xUsername,
        timestamp: serverTimestamp(),
        reactions: {},
        engagements: []
      });

      // Update user's last submission timestamp
      await updateDoc(userDocRef, {
        lastLinkSubmissionTimestamp: serverTimestamp()
      });

      setNewLinkUrl('');
      setShowSubmitModal(false);
      displayMessage('Link submitted successfully!', 'success');
    } catch (error) {
      console.error("Error submitting link:", error);
      displayMessage('Failed to submit link. Please try again.', 'error');
    }
  };

  const canSubmitLink = useCallback(() => {
    if (!userProfile) return false;

    // Check 24-hour cooldown for submission
    if (userProfile.lastLinkSubmissionTimestamp) {
      const lastSubmissionTime = userProfile.lastLinkSubmissionTimestamp.toDate();
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (lastSubmissionTime > twentyFourHoursAgo) {
        return false; // Cannot submit if within 24 hours
      }
    }

    // Check for engagement within the last 24 hours
    if (links.length > 0) { // Only if there are links to engage with
      if (userProfile.lastEngagementTimestamp) {
        const lastEngagementTime = userProfile.lastEngagementTimestamp.toDate();
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (lastEngagementTime < twentyFourHoursAgo) {
          return false; // Cannot submit if no engagement in last 24 hours
        }
      } else {
        return false; // Cannot submit if no engagement ever (and there are links to engage with)
      }
    }

    return true; // All conditions met
  }, [userProfile, links]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4 font-inter">
        <div className="bg-white p-8 rounded-xl shadow-lg text-center">
          <p className="text-xl font-semibold text-gray-700">Loading application...</p>
          <p className="text-gray-500 mt-2">Please wait while we prepare everything.</p>
        </div>
      </div>
    );
  }

  if (!hasEnteredInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4 font-inter">
        <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
          <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">Welcome!</h2>
          <p className="text-gray-600 mb-6 text-center">Please enter your name and X/Twitter username to get started.</p>
          <div className="mb-4">
            <label htmlFor="name" className="block text-gray-700 text-sm font-semibold mb-2">Your Name</label>
            <input
              type="text"
              id="name"
              className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="e.g., John Doe"
            />
          </div>
          <div className="mb-6">
            <label htmlFor="xUsername" className="block text-gray-700 text-sm font-semibold mb-2">X/Twitter Username</label>
            <input
              type="text"
              id="xUsername"
              className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={xUsername}
              onChange={(e) => setXUsername(e.target.value)}
              placeholder="e.g., @johndoe"
            />
          </div>
          <button
            onClick={handleEnterInfo}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition duration-300 ease-in-out shadow-md"
          >
            Continue
          </button>
          {message && (
            <div className={`mt-4 p-3 rounded-lg text-center ${messageType === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {message}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ db, auth, userId, userProfile, displayMessage, links, handleEngageLink, handleReactLink }}>
      <div className="min-h-screen bg-gray-100 p-4 font-inter flex flex-col items-center">


<div className="flex justify-center mt-4">
  <img src="blob/src/assets/logo.png" alt="Logo" className="h-16" />
</div>


        <div className="w-full max-w-4xl bg-white rounded-xl shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-4 text-center">X/Twitter Link Engagement Board</h1>
          <div className="text-center text-gray-600 mb-4">
            <p>Welcome, <span className="font-semibold">{userName}</span> (<span className="font-semibold">{xUsername}</span>)!</p>
            <p className="text-sm">Your User ID: <span className="font-mono text-xs bg-gray-200 px-2 py-1 rounded">{userId}</span></p>
            {userProfile?.lastLinkSubmissionTimestamp && (
              <p className="text-sm mt-1">Last Submitted: {formatTimestamp(userProfile.lastLinkSubmissionTimestamp)}</p>
            )}
            {userProfile?.lastEngagementTimestamp && (
              <p className="text-sm">Last Engaged: {formatTimestamp(userProfile.lastEngagementTimestamp)}</p>
            )}
          </div>

          {message && (
            <div className={`mb-4 p-3 rounded-lg text-center ${messageType === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {message}
            </div>
          )}

          <div className="flex justify-center mb-6">
            <button
              onClick={() => setShowSubmitModal(true)}
              disabled={!canSubmitLink()}
              className={`py-3 px-6 rounded-lg font-bold text-white transition duration-300 ease-in-out shadow-md
                ${canSubmitLink() ? 'bg-green-600 hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-opacity-50' : 'bg-gray-400 cursor-not-allowed'}`}
            >
              Submit New X/Twitter Link
            </button>
          </div>

          <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">Links on the Board</h2>
          {links.length === 0 ? (
            <p className="text-gray-600 text-center py-8">No links posted yet. Be the first to share!</p>
          ) : (
            <div className="grid gap-6">
              {links.map((link) => (
                <LinkCard key={link.id} link={link} />
              ))}
            </div>
          )}
        </div>

        {showSubmitModal && (
          <SubmitLinkModal
            newLinkUrl={newLinkUrl}
            setNewLinkUrl={setNewLinkUrl}
            handleSubmitLink={handleSubmitLink}
            setShowSubmitModal={setShowSubmitModal}
            message={message}
            messageType={messageType}
          />
        )}
      </div>
    </AppContext.Provider>
  );
};

const LinkCard = ({ link }) => {
  const { userId, handleEngageLink, handleReactLink } = useContext(AppContext);

  const userReaction = link.reactions?.[userId];
  const hasEngaged = link.engagements?.some(e => e.userId === userId) || false;

  const getReactionCount = (type) => {
    return Object.values(link.reactions || {}).filter(r => r === type).length;
  };

  return (
    <div className="bg-gray-50 p-5 rounded-xl shadow-md border border-gray-200">
      <div className="flex justify-between items-start mb-3">
        <div>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 text-lg font-semibold break-all"
          >
            {link.url}
          </a>
          <p className="text-sm text-gray-600 mt-1">
            Posted by <span className="font-medium">{link.submittedByName}</span> (<span className="font-medium">{link.submittedByXUsername}</span>)
          </p>
          <p className="text-xs text-gray-500">
            {formatTimestamp(link.timestamp)}
          </p>
        </div>
        <div className="flex-shrink-0">
          <button
            onClick={() => handleEngageLink(link.id, link.url)}
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out shadow-sm text-sm"
          >
            Engage
          </button>
        </div>
      </div>

      <div className="flex items-center space-x-3 text-gray-700 text-sm mt-3 pt-3 border-t border-gray-200">
        <p className="font-semibold">Engaged?</p>
        <button
          onClick={() => handleReactLink(link.id, '👍')}
          disabled={!hasEngaged}
          className={`px-3 py-1 rounded-full flex items-center space-x-1 transition duration-200
            ${userReaction === '👍' ? 'bg-blue-200 text-blue-800' : 'bg-gray-200 hover:bg-gray-300'}
            ${!hasEngaged ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span>👍</span>
          <span>{getReactionCount('👍')}</span>
        </button>
      </div>
    </div>
  );
};

const SubmitLinkModal = ({ newLinkUrl, setNewLinkUrl, handleSubmitLink, setShowSubmitModal, message, messageType }) => {
  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">Submit Your X/Twitter Link</h2>
        <div className="mb-4">
          <label htmlFor="linkUrl" className="block text-gray-700 text-sm font-semibold mb-2">X/Twitter Link URL</label>
          <input
            type="url"
            id="linkUrl"
            className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={newLinkUrl}
            onChange={(e) => setNewLinkUrl(e.target.value)}
            placeholder="e.g., https://x.com/username/status/1234567890"
          />
        </div>
        {message && (
          <div className={`mb-4 p-3 rounded-lg text-center ${messageType === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {message}
          </div>
        )}
        <div className="flex justify-end space-x-4">
          <button
            onClick={() => setShowSubmitModal(false)}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 transition duration-300 ease-in-out"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmitLink}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition duration-300 ease-in-out shadow-md"
          >
            Submit Link
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
