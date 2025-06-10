import React, { useState, useEffect, useCallback } from 'react';
import campaignService from '../services/campaignService';
import listService from '../services/listService';
import { useNavigate } from 'react-router-dom';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

function CampaignManagement() {
    const [campaigns, setCampaigns] = useState([]);
    const [lists, setLists] = useState([]);
    const [newCampaignData, setNewCampaignData] = useState({
        name: '',
        subject: '',
        htmlContent: '',
        plainTextContent: '',
        list: '',
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [campaignOpenStats, setCampaignOpenStats] = useState({});
    // --- NEW STATE: To store click statistics, indexed by campaignId ---
    const [campaignClickStats, setCampaignClickStats] = useState({});
    // --- END NEW STATE ---
    const navigate = useNavigate();

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [campaignsData, listsData] = await Promise.all([
                campaignService.getCampaigns(),
                listService.getLists()
            ]);

            setCampaigns(campaignsData);
            setLists(listsData);

            if (listsData.length > 0) {
                setNewCampaignData(prev => ({ ...prev, list: listsData[0]._id }));
            }

            const statsPromises = campaignsData.map(campaign =>
                Promise.all([
                    campaignService.getCampaignOpenStats(campaign._id),
                    campaignService.getCampaignClickStats(campaign._id) // --- NEW: Fetch Click Stats ---
                ])
            );
            const allStats = await Promise.all(statsPromises);

            const openStatsMap = {};
            const clickStatsMap = {}; // --- NEW Map for Click Stats ---

            allStats.forEach((campaignStats, index) => {
                const campaignId = campaignsData[index]._id;
                openStatsMap[campaignId] = campaignStats[0]; // First item is open stats
                clickStatsMap[campaignId] = campaignStats[1]; // --- NEW: Second item is click stats ---
            });

            setCampaignOpenStats(openStatsMap);
            setCampaignClickStats(clickStatsMap); // --- NEW: Set Click Stats State ---

        } catch (err) {
            console.error('Error fetching data:', err.response?.data || err.message);
            setError(err.response?.data?.message || 'Failed to fetch data. Please login again.');
            if (err.response && err.response.status === 401) {
                localStorage.removeItem('user');
                navigate('/login');
            }
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setNewCampaignData({ ...newCampaignData, [name]: value });
    };

    const handleQuillChange = (content) => {
        setNewCampaignData(prev => ({ ...prev, htmlContent: content, plainTextContent: content.replace(/<[^>]*>/g, '') }));
    };

    const handleCreateCampaign = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        if (!newCampaignData.name || !newCampaignData.subject || !newCampaignData.htmlContent || !newCampaignData.list) {
            alert('Please fill in all required fields (Name, Subject, HTML Content, and select a List).');
            return;
        }
        try {
            await campaignService.createCampaign(newCampaignData);
            setNewCampaignData({
                name: '',
                subject: '',
                htmlContent: '',
                plainTextContent: '',
                list: lists.length > 0 ? lists[0]._id : '',
            });
            setSuccessMessage('Campaign created successfully!');
            await fetchData();
        } catch (err) {
            console.error('Error creating campaign:', err.response?.data || err.message);
            setError(err.response?.data?.message || 'Failed to create campaign.');
        }
    };

    const handleDeleteCampaign = async (campaignId) => {
        if (window.confirm('Are you sure you want to delete this campaign?')) {
            setError(null);
            setSuccessMessage(null);
            try {
                await campaignService.deleteCampaign(campaignId);
                setSuccessMessage('Campaign deleted successfully!');
                await fetchData();
            } catch (err) {
                console.error('Error deleting campaign:', err.response?.data || err.message);
                setError(err.response?.data?.message || 'Failed to delete campaign.');
            }
        }
    };

    const handleSendCampaign = async (campaignId, campaignName, listName, subscriberCount) => {
        if (subscriberCount === 0) {
            alert(`The list "${listName}" has no subscribers. Please add subscribers to the list before sending this campaign.`);
            return;
        }
        if (!window.confirm(`Are you sure you want to send "${campaignName}" to <span class="math-inline">\{listName\} \(</span>{subscriberCount} subscribers)? This action cannot be undone.`)) {
            return;
        }

        setError(null);
        setSuccessMessage(null);
        try {
            const response = await campaignService.sendCampaign(campaignId);
            setSuccessMessage(`Campaign "${campaignName}" sending initiated! Total: ${response.totalSubscribers} subscribers. (Updates will appear shortly)`);
            await fetchData();
        } catch (err) {
            console.error('Error sending campaign:', err.response?.data || err.message);
            setError(err.response?.data?.message || 'Failed to send campaign.');
        }
    };


    if (loading) {
        return <div style={{ textAlign: 'center', marginTop: '50px' }}>Loading campaigns...</div>;
    }

    return (
        <div style={{ padding: '20px', maxWidth: '1000px', margin: '20px auto', border: '1px solid #eee', borderRadius: '8px', boxShadow: '2px 2px 5px rgba(0,0,0,0.1)' }}>
            <h2>Email Campaigns</h2>

            {error && <p style={{ color: 'red', marginBottom: '15px' }}>Error: {error}</p>}
            {successMessage && <p style={{ color: 'green', marginBottom: '15px' }}>{successMessage}</p>}

            <form onSubmit={handleCreateCampaign} style={{ marginBottom: '30px', padding: '20px', border: '1px solid #ddd', borderRadius: '5px' }}>
                <h3>Create New Campaign</h3>
                <div style={{ marginBottom: '15px' }}>
                    <label htmlFor="name" style={{ display: 'block', marginBottom: '5px' }}>Campaign Name:</label>
                    <input
                        type="text"
                        id="name"
                        name="name"
                        value={newCampaignData.name}
                        onChange={handleInputChange}
                        required
                        style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                    />
                </div>
                <div style={{ marginBottom: '15px' }}>
                    <label htmlFor="subject" style={{ display: 'block', marginBottom: '5px' }}>Subject:</label>
                    <input
                        type="text"
                        id="subject"
                        name="subject"
                        value={newCampaignData.subject}
                        onChange={handleInputChange}
                        required
                        style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                    />
                </div>
                <div style={{ marginBottom: '15px' }}>
                    <label htmlFor="list" style={{ display: 'block', marginBottom: '5px' }}>Target List:</label>
                    <select
                        id="list"
                        name="list"
                        value={newCampaignData.list}
                        onChange={handleInputChange}
                        required
                        style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                    >
                        <option value="">-- Select a List --</option>
                        {lists.map(list => (
                            <option key={list._id} value={list._id}>{list.name}</option>
                        ))}
                    </select>
                    {lists.length === 0 && (
                        <p style={{marginTop: '5px', color: '#ffc107'}}>No lists available. Please create a list first from the "Lists" page.</p>
                    )}
                </div>
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Email HTML Content:</label>
                    <ReactQuill
                        theme="snow"
                        value={newCampaignData.htmlContent}
                        onChange={handleQuillChange}
                        style={{ height: '200px', marginBottom: '40px' }}
                    />
                </div>
                <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '20px' }}>
                    Create Campaign
                </button>
            </form>

            {campaigns.length === 0 ? (
                <p>You don't have any email campaigns yet. Create one above!</p>
            ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f2f2f2' }}>
                            <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Campaign Name</th>
                            <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Subject</th>
                            <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Target List</th>
                            <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Status</th>
                            <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Opens (Total/Unique)</th>
                            {/* --- NEW COLUMN HEADER FOR CLICKS --- */}
                            <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Clicks (Total/Unique)</th>
                            {/* --- END NEW COLUMN HEADER --- */}
                            <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Created At</th>
                            <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {campaigns.map((campaign) => {
                            const openStats = campaignOpenStats[campaign._id] || { totalOpens: 0, uniqueOpens: 0 };
                            // --- NEW: Get click stats for the current campaign, with fallback to 0 ---
                            const clickStats = campaignClickStats[campaign._id] || { totalClicks: 0, uniqueClicks: 0 };
                            // --- END NEW ---
                            return (
                                <tr key={campaign._id}>
                                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>{campaign.name}</td>
                                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>{campaign.subject}</td>
                                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                                        {campaign.list ? campaign.list.name : 'N/A'}
                                    </td>
                                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>{campaign.status}</td>
                                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                                        {openStats.totalOpens}/{openStats.uniqueOpens}
                                    </td>
                                    {/* --- NEW COLUMN: Display Click Stats --- */}
                                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                                        {clickStats.totalClicks}/{clickStats.uniqueClicks}
                                    </td>
                                    {/* --- END NEW COLUMN --- */}
                                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>{new Date(campaign.createdAt).toLocaleDateString()}</td>
                                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                                        <button
                                            onClick={() => handleDeleteCampaign(campaign._id)}
                                            style={{ padding: '5px 10px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '10px' }}
                                        >
                                            Delete
                                        </button>
                                        {campaign.status === 'draft' || campaign.status === 'paused' ? (
                                            <button
                                                onClick={() => {
                                                    const targetList = lists.find(l => l._id === (campaign.list && campaign.list._id));
                                                    const subscriberCount = targetList?.subscribers?.length || 0;
                                                    const listName = campaign.list?.name || 'Unknown List';
                                                    handleSendCampaign(campaign._id, campaign.name, listName, subscriberCount);
                                                }}
                                                style={{ padding: '5px 10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                            >
                                                Send
                                            </button>
                                        ) : (
                                            <span style={{ color: '#6c757d', marginLeft: '10px' }}>{campaign.status}</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );
}

export default CampaignManagement;